import prisma from '../../config/prisma.js';
import { deleteFileByUrl } from '../media/service.js';
import type { UpdateUserInput } from './types.js';

// Fields exposed in public profile responses (never email, password, role)
const PUBLIC_SELECT = {
  id:              true,
  username:        true,
  display_name:    true,
  bio:             true,
  avatar_url:      true,
  banner_url:      true,
  status:          true,
  persona:         true,
  likes:           true,
  dislikes:        true,
  accent_color:    true,
  created_at:      true,
  badge_type:      true,
  website:         true,
  location:        true,
  pronouns:        true,
  job_title:            true,
  relationship_status:  true,
  relationship_with:    true,
  country:              true,
  fursona_name:         true,
  fursona_color:        true,
  fursona_photo_url:    true,
  has_fursuit:          true,
  fursuit_photo_url:    true,
  fursuit_description:  true,
  fursuit_maker:        true,
  birth_date:           true,
  relationship_since:   true,
  pinned_post_id:       true,
  role:                 true,
  social_links:         true,
  interests:            true,
  subscription_tier:    true,
  profile_theme:        true,
  profile_bg_url:       true,
  profile_frame:        true,
  is_verified:          true,
  verified_at:          true,
} as const;

export const usersService = {
  async getUserById(id: string) {
    // Accept both UUID and username
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    const PROFILE_SELECT = {
      select: {
        ...PUBLIC_SELECT,
        _count: { select: { followers: true, following: true, posts: true } },
        wallet: { select: { balance: true } },
        pinnedPost: {
          select: {
            id: true, content: true, media_urls: true, created_at: true, rating: true, is_nsfw: true, category: true,
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            tags: { include: { tag: true } },
            _count: { select: { votes: true, repaws: true, comments: true } },
          },
        },
      },
    }
    if (isUUID) {
      return prisma.user.findFirst({
        where: { id, deleted_at: null },
        ...PROFILE_SELECT,
      })
    }
    return prisma.user.findFirst({
      where: { username: id, deleted_at: null },
      ...PROFILE_SELECT,
    })
  },

  async updateUser(id: string, data: UpdateUserInput) {
    // ── Fetch current media URLs before overwriting ─────────────────────
    const current = await prisma.user.findUnique({
      where: { id, deleted_at: null },
      select: { avatar_url: true, banner_url: true },
    });

    if (current) {
      const historyEntries: { user_id: string; type: string; url: string }[] = [];

      // If avatar is actually changing (new non-empty value, different from current)
      const newAvatar = (data as any).avatar_url;
      if (typeof newAvatar === 'string' && newAvatar && newAvatar !== current.avatar_url && current.avatar_url) {
        historyEntries.push({ user_id: id, type: 'avatar', url: current.avatar_url });
        // Delete old file from MinIO (best-effort, non-blocking)
        deleteFileByUrl(current.avatar_url).catch(() => {});
      }

      // If banner is actually changing
      const newBanner = (data as any).banner_url;
      if (typeof newBanner === 'string' && newBanner && newBanner !== current.banner_url && current.banner_url) {
        historyEntries.push({ user_id: id, type: 'banner', url: current.banner_url });
        deleteFileByUrl(current.banner_url).catch(() => {});
      }

      if (historyEntries.length > 0) {
        await prisma.mediaHistory.createMany({ data: historyEntries });
      }
    }

    // ── Normalise birth_date to a proper Date if it's a plain string ────────
    if (typeof (data as any).birth_date === 'string') {
      const raw = (data as any).birth_date as string;
      if (raw) {
        // Accept "YYYY-MM-DD" or full ISO — always store as midnight UTC
        (data as any).birth_date = new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);
      } else {
        (data as any).birth_date = null;
      }
    }

    return prisma.user.update({
      where: { id, deleted_at: null },
      data,
      select: PUBLIC_SELECT,
    });
  },

  async getMediaHistory(userId: string, type?: 'avatar' | 'banner', limit = 20) {
    return prisma.mediaHistory.findMany({
      where: { user_id: userId, ...(type ? { type } : {}) },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: { id: true, type: true, url: true, created_at: true },
    });
  },

  async pinPost(userId: string, postId: string) {
    // Verify the post belongs to the user
    const post = await prisma.post.findUnique({ where: { id: postId, deleted_at: null }, select: { author_id: true } });
    if (!post) throw new Error('Post not found');
    if (post.author_id !== userId) throw new Error('Can only pin your own posts');
    return prisma.user.update({
      where: { id: userId },
      data: { pinned_post_id: postId },
      select: { pinned_post_id: true },
    });
  },

  async unpinPost(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { pinned_post_id: null },
      select: { pinned_post_id: true },
    });
  },

  async searchUsers(query: string, limit = 8) {
    const q = query.trim();
    if (!q) return [];
    return prisma.user.findMany({
      where: {
        deleted_at: null,
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { display_name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: PUBLIC_SELECT,
      take: limit,
      orderBy: { created_at: 'desc' },
    });
  },

  async getRecommendedUsers(currentUserId: string, limit = 6) {
    // ── Build excluded set: self + already-following + blocked ───────────
    const [followingRows, blockRows] = await Promise.all([
      prisma.follow.findMany({ where: { follower_id: currentUserId }, select: { following_id: true } }),
      prisma.block.findMany({
        where: { OR: [{ blocker_id: currentUserId }, { blocked_id: currentUserId }] },
        select: { blocker_id: true, blocked_id: true },
      }),
    ]);
    const myFollowingSet = new Set(followingRows.map((r) => r.following_id));
    const excludeIds = new Set<string>([currentUserId, ...myFollowingSet]);
    for (const b of blockRows) { excludeIds.add(b.blocker_id); excludeIds.add(b.blocked_id); }

    // ── Find my friends (mutual follows = both follow each other) ────────
    const followerRows = await prisma.follow.findMany({
      where: { following_id: currentUserId },
      select: { follower_id: true },
    });
    const myFollowerSet = new Set(followerRows.map((r) => r.follower_id));
    const myFriendIds = Array.from(myFollowingSet).filter((id) => myFollowerSet.has(id));

    // Also include accepted friendship connections
    const friendshipRows = await prisma.friendship.findMany({
      where: { OR: [{ requester_id: currentUserId }, { addressee_id: currentUserId }], status: 'accepted' },
      select: { requester_id: true, addressee_id: true },
    });
    for (const f of friendshipRows) {
      const friendId = f.requester_id === currentUserId ? f.addressee_id : f.requester_id;
      if (!myFriendIds.includes(friendId)) myFriendIds.push(friendId);
    }

    if (myFriendIds.length > 0) {
      // ── Friends-of-friends scoring ──────────────────────────────────
      const friendFollowRows = await prisma.follow.findMany({
        where: {
          OR: [
            { follower_id:  { in: myFriendIds } },
            { following_id: { in: myFriendIds } },
          ],
        },
        select: { follower_id: true, following_id: true },
      });
      const mutualCount = new Map<string, number>();
      for (const row of friendFollowRows) {
        for (const candidateId of [row.follower_id, row.following_id]) {
          if (!excludeIds.has(candidateId)) {
            mutualCount.set(candidateId, (mutualCount.get(candidateId) ?? 0) + 1);
          }
        }
      }
      if (mutualCount.size > 0) {
        const sortedIds = Array.from(mutualCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([id]) => id);
        const users = await prisma.user.findMany({
          where: { id: { in: sortedIds }, deleted_at: null },
          select: PUBLIC_SELECT,
        });
        const sorted = users.sort((a, b) => (mutualCount.get(b.id) ?? 0) - (mutualCount.get(a.id) ?? 0));
        if (sorted.length >= limit) return sorted;
        // fill rest below
        const filled = new Set(sorted.map((u) => u.id));
        filled.forEach((id) => excludeIds.add(id));
        const extras = await prisma.post.findMany({
          where: { deleted_at: null, author_id: { notIn: Array.from(excludeIds) } },
          orderBy: { created_at: 'desc' },
          select: { author: { select: PUBLIC_SELECT } },
          distinct: ['author_id'],
          take: limit - sorted.length,
        });
        return [...sorted, ...extras.map((p) => p.author)];
      }
    }

    // ── Fallback: recently active users ──────────────────────────────────
    const active = await prisma.post.findMany({
      where: { deleted_at: null, author_id: { notIn: Array.from(excludeIds) } },
      orderBy: { created_at: 'desc' },
      select: { author: { select: PUBLIC_SELECT } },
      distinct: ['author_id'],
      take: limit,
    });
    const authors = active.map((p) => p.author);
    if (authors.length >= limit) return authors;
    const existingIds = new Set(authors.map((u) => u.id));
    excludeIds.forEach((id) => existingIds.add(id));
    const extras = await prisma.user.findMany({
      where: { id: { notIn: Array.from(existingIds) }, deleted_at: null },
      select: PUBLIC_SELECT,
      take: limit - authors.length,
      orderBy: { created_at: 'desc' },
    });
    return [...authors, ...extras];
  },

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new Error('Cannot block yourself');
    await prisma.block.upsert({
      where: { blocker_id_blocked_id: { blocker_id: blockerId, blocked_id: blockedId } },
      create: { blocker_id: blockerId, blocked_id: blockedId },
      update: {},
    });
  },

  async unblockUser(blockerId: string, blockedId: string) {
    await prisma.block.deleteMany({
      where: { blocker_id: blockerId, blocked_id: blockedId },
    });
  },

  async getBlockStatus(viewerId: string, targetId: string) {
    const b = await prisma.block.findUnique({
      where: { blocker_id_blocked_id: { blocker_id: viewerId, blocked_id: targetId } },
    });
    return { blocked: !!b };
  },

  async setPublicKey(userId: string, publicKey: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { public_key: publicKey },
      select: { id: true },
    });
  },

  async getPublicKey(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { public_key: true },
    });
    return user?.public_key ?? null;
  },

};
