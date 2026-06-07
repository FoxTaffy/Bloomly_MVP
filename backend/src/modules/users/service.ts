import prisma from '../../config/prisma.js';
import { deleteFileByUrl } from '../media/service.js';
import { getUserBadgeLevel } from '../../lib/badges.js';
import sharp from 'sharp';
import type { UpdateUserInput, UpsertFursonaInput, UpsertFursuitInput } from './types.js';

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
  fursona_gender:       true,
  fursona_description:  true,
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
  verification_type:    true,
  artist_since:         true,
  onboarding_done:      true,
  allow_messages:       true,
  donate_url:           true,
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
    const raw = isUUID
      ? await prisma.user.findFirst({ where: { id, deleted_at: null }, ...PROFILE_SELECT })
      : await prisma.user.findFirst({ where: { username: id, deleted_at: null }, ...PROFILE_SELECT });

    if (!raw) return null;

    // Attach computed badge_level
    return { ...raw, badge_level: getUserBadgeLevel((raw as any).artist_since) };
  },

  async updateUser(id: string, data: UpdateUserInput) {
    // ── Fetch current media URLs before overwriting ─────────────────────
    const current = await prisma.user.findUnique({
      where: { id, deleted_at: null },
      select: { avatar_url: true, banner_url: true },
    });

    if (current) {
      const historyEntries: { user_id: string; type: string; url: string }[] = [];

      // If avatar is actually changing — archive current, keep file in MinIO for history gallery
      const newAvatar = (data as any).avatar_url;
      if (typeof newAvatar === 'string' && newAvatar && newAvatar !== current.avatar_url && current.avatar_url) {
        historyEntries.push({ user_id: id, type: 'avatar', url: current.avatar_url });
      }

      // If banner is actually changing — archive current, keep file
      const newBanner = (data as any).banner_url;
      if (typeof newBanner === 'string' && newBanner && newBanner !== current.banner_url && current.banner_url) {
        historyEntries.push({ user_id: id, type: 'banner', url: current.banner_url });
      }

      if (historyEntries.length > 0) {
        await prisma.mediaHistory.createMany({ data: historyEntries });
      }
    }

    // ── Normalise artist_since to a proper Date if it's a plain string ───────
    if (typeof (data as any).artist_since === 'string') {
      const raw = (data as any).artist_since as string;
      if (raw) {
        const d = new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);
        if (d.getTime() > Date.now()) throw new Error('artist_since cannot be in the future');
        (data as any).artist_since = d;
      } else {
        (data as any).artist_since = null;
      }
    }

    // ── Security: verified users cannot change artist_since ─────────────────
    if ((data as any).artist_since !== undefined) {
      const user = await prisma.user.findUnique({ where: { id }, select: { is_verified: true } });
      if (user?.is_verified) throw new Error('Verified users cannot change artist_since');
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

    // ── Normalise relationship_since to a proper Date if it's a plain string
    if (typeof (data as any).relationship_since === 'string') {
      const raw = (data as any).relationship_since as string;
      if (raw) {
        (data as any).relationship_since = new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);
      } else {
        (data as any).relationship_since = null;
      }
    }

    return prisma.user.update({
      where: { id, deleted_at: null },
      data: data as any,
      select: PUBLIC_SELECT,
    });
  },

  async updateUsername(id: string, username: string) {
    const existing = await prisma.user.findFirst({
      where: { username, deleted_at: null, NOT: { id } },
      select: { id: true },
    });
    if (existing) throw new Error('Этот никнейм уже занят');
    return prisma.user.update({
      where: { id, deleted_at: null },
      data: { username },
      select: { id: true, username: true },
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

  async deleteAvatarHistoryItem(userId: string, historyId: string) {
    const item = await prisma.mediaHistory.findFirst({
      where: { id: historyId, user_id: userId, type: 'avatar' },
    });
    if (!item) throw Object.assign(new Error('History item not found'), { statusCode: 404 });

    await prisma.mediaHistory.delete({ where: { id: historyId } });
    deleteFileByUrl(item.url).catch(() => {});
  },

  async restoreAvatarFromHistory(userId: string, historyId: string) {
    const item = await prisma.mediaHistory.findFirst({
      where: { id: historyId, user_id: userId, type: 'avatar' },
    });
    if (!item) throw Object.assign(new Error('History item not found'), { statusCode: 404 });

    const user = await prisma.user.findUnique({
      where: { id: userId, deleted_at: null },
      select: { avatar_url: true },
    });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    await prisma.$transaction(async (tx) => {
      // Archive current avatar into history (keep file in MinIO)
      if (user.avatar_url && user.avatar_url !== item.url) {
        await tx.mediaHistory.create({
          data: { user_id: userId, type: 'avatar', url: user.avatar_url },
        });
      }
      // Promote historical avatar to current
      await tx.user.update({
        where: { id: userId },
        data: { avatar_url: item.url },
      });
      // Remove from history since it's now the current avatar
      await tx.mediaHistory.delete({ where: { id: historyId } });
    });

    return prisma.user.findUnique({
      where: { id: userId },
      select: { avatar_url: true },
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

  /** Change subscription tier. Validated allowlist prevents SQL-injection / unexpected values. */
  async updateSubscriptionTier(userId: string, tier: string) {
    const ALLOWED_TIERS = ['free', 'lite', 'pro', 'business'] as const;
    if (!ALLOWED_TIERS.includes(tier as any)) {
      throw Object.assign(new Error(`Invalid tier: ${tier}`), { statusCode: 400 });
    }
    return prisma.user.update({
      where: { id: userId, deleted_at: null },
      data: { subscription_tier: tier },
      select: { id: true, subscription_tier: true },
    });
  },

  async getPublicKey(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { public_key: true },
    });
    return user?.public_key ?? null;
  },

  async getNotifyStatus(viewerId: string, targetId: string) {
    const follow = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: viewerId, following_id: targetId } },
      select: { notify_posts: true },
    });
    return { following: !!follow, notifyPosts: follow?.notify_posts ?? false };
  },

  async toggleNotifyPosts(viewerId: string, targetId: string) {
    const follow = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: viewerId, following_id: targetId } },
    });
    if (!follow) throw Object.assign(new Error('Not following this user'), { statusCode: 404 });
    const updated = await prisma.follow.update({
      where: { id: follow.id },
      data: { notify_posts: !follow.notify_posts },
    });
    return { notifyPosts: updated.notify_posts };
  },

  /** Soft-delete account and revoke all refresh tokens */
  async deleteAccount(userId: string) {
    const now = new Date();
    await prisma.$transaction([
      // Revoke all refresh tokens
      prisma.refreshToken.updateMany({ where: { user_id: userId, revoked: false }, data: { revoked: true } }),
      // Soft-delete the user
      prisma.user.update({ where: { id: userId }, data: { deleted_at: now } }),
    ]);
  },

  // ── Fursona ────────────────────────────────────────────────────────────────

  /** Return fursona for display. Strips likes/dislikes for non-owners when owner marked them private. */
  async getFursona(userId: string, viewerId?: string) {
    const fursona = await prisma.fursona.findUnique({
      where: { user_id: userId },
    });
    if (!fursona || fursona.deleted_at) return null;

    if (!fursona.likes_dislikes_visible && viewerId !== userId) {
      return { ...fursona, likes: [], dislikes: [] };
    }
    return fursona;
  },

  /** Create or update the fursona for a user (upsert). */
  async upsertFursona(userId: string, data: UpsertFursonaInput) {
    // Track reference image replacement in MediaHistory
    if (data.reference_image_url !== undefined) {
      const existing = await prisma.fursona.findUnique({ where: { user_id: userId } });
      if (existing?.reference_image_url && existing.reference_image_url !== data.reference_image_url) {
        await prisma.mediaHistory.create({
          data: { user_id: userId, type: 'fursona_reference', url: existing.reference_image_url },
        });
        deleteFileByUrl(existing.reference_image_url).catch(() => {});
      }
    }

    return prisma.fursona.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...data },
      update: { ...data, updated_at: new Date() },
    });
  },

  /**
   * Download the reference image from MinIO and composite a Bloomly watermark.
   * The original URL is never returned to the client — only this
   * protected stream is served through the authenticated endpoint.
   */
  async getWatermarkedReference(userId: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const fursona = await prisma.fursona.findUnique({
      where: { user_id: userId },
      select: { reference_image_url: true, deleted_at: true },
    });
    if (!fursona?.reference_image_url || fursona.deleted_at) return null;

    const owner = await prisma.user.findUnique({ where: { id: userId }, select: { username: true } });
    const username = owner?.username ?? 'unknown';

    const response = await fetch(fursona.reference_image_url);
    if (!response.ok) return null;
    const srcBuffer = Buffer.from(await response.arrayBuffer());

    const metadata = await sharp(srcBuffer).metadata();
    const w = metadata.width  ?? 800;
    const h = metadata.height ?? 600;
    const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.035));
    const padding  = fontSize + 4;
    const text     = `bloomly.fun · @${username}`;

    // SVG overlay: bottom-right corner with drop-shadow for readability
    const svgOverlay = Buffer.from(
      `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="sh">
            <feDropShadow dx="1" dy="1" stdDeviation="1.5" flood-color="rgba(0,0,0,0.55)" />
          </filter>
        </defs>
        <text x="${w - padding}" y="${h - padding}"
          text-anchor="end"
          font-family="Arial, sans-serif"
          font-size="${fontSize}"
          font-weight="bold"
          fill="rgba(255,255,255,0.78)"
          filter="url(#sh)"
        >${text}</text>
      </svg>`
    );

    const buffer = await sharp(srcBuffer)
      .composite([{ input: svgOverlay, gravity: 'southeast' }])
      .jpeg({ quality: 88 })
      .toBuffer();

    return { buffer, mimeType: 'image/jpeg' };
  },

  // ── Fursuit ────────────────────────────────────────────────────────────────

  async getFursuits(userId: string) {
    return prisma.fursuit.findMany({
      where: { user_id: userId, deleted_at: null },
      orderBy: { created_at: 'asc' },
    });
  },

  async getFursuit(userId: string, fursuitId: string) {
    return prisma.fursuit.findFirst({
      where: { id: fursuitId, user_id: userId, deleted_at: null },
    });
  },

  async createFursuit(userId: string, data: UpsertFursuitInput) {
    return prisma.fursuit.create({
      data: { user_id: userId, ...data },
    });
  },

  async updateFursuit(userId: string, fursuitId: string, data: UpsertFursuitInput) {
    const existing = await prisma.fursuit.findFirst({
      where: { id: fursuitId, user_id: userId, deleted_at: null },
    });
    if (!existing) throw Object.assign(new Error('Fursuit not found'), { statusCode: 404 });

    if (data.image_url !== undefined && existing.image_url && existing.image_url !== data.image_url) {
      await prisma.mediaHistory.create({
        data: { user_id: userId, type: 'fursuit_image', url: existing.image_url },
      });
      deleteFileByUrl(existing.image_url).catch(() => {});
    }

    return prisma.fursuit.update({
      where: { id: fursuitId },
      data: { ...data, updated_at: new Date() },
    });
  },

  async deleteFursuit(userId: string, fursuitId: string) {
    const existing = await prisma.fursuit.findFirst({
      where: { id: fursuitId, user_id: userId, deleted_at: null },
    });
    if (!existing) throw Object.assign(new Error('Fursuit not found'), { statusCode: 404 });

    return prisma.fursuit.update({
      where: { id: fursuitId },
      data: { deleted_at: new Date() },
      select: { id: true },
    });
  },

};
