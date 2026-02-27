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
  birth_date:           true,
  relationship_since:   true,
  pinned_post_id:       true,
  role:                 true,
  social_links:         true,
  interests:            true,
} as const;

export const usersService = {
  async getUserById(id: string) {
    return prisma.user.findUnique({
      where: { id, deleted_at: null },
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
    });
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

  async toggleAdMode(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user) throw new Error('User not found');
    const newRole = user.role === 'advertiser' ? 'user' : 'advertiser';
    return prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
      select: { id: true, role: true },
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

  async getRecommendedUsers(currentUserId: string, limit = 4) {
    // Exclude current user + everyone they already follow
    const followingRows = await prisma.follow.findMany({
      where: { follower_id: currentUserId },
      select: { following_id: true },
    });
    const excludeIds = new Set(followingRows.map((r) => r.following_id));
    excludeIds.add(currentUserId);

    // Grab users who have posted recently, excluding self and already-followed
    const active = await prisma.post.findMany({
      where: { deleted_at: null, author_id: { notIn: Array.from(excludeIds) } },
      orderBy: { created_at: 'desc' },
      select: { author: { select: PUBLIC_SELECT } },
      distinct: ['author_id'],
      take: limit,
    });
    const authors = active.map((p) => p.author);
    if (authors.length >= limit) return authors;
    // Fill remainder with newest users not yet in the list
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
};
