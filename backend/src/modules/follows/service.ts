import prisma from '../../config/prisma.js';
import { notificationService } from '../notifications/service.js';

export const followsService = {
  async toggle(followerId: string, followingId: string) {
    if (followerId === followingId) throw new Error('Cannot follow yourself');

    const existing = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: followerId, following_id: followingId } },
    });

    if (existing) {
      await prisma.follow.delete({
        where: { follower_id_following_id: { follower_id: followerId, following_id: followingId } },
      });
      return { following: false };
    } else {
      await prisma.follow.create({ data: { follower_id: followerId, following_id: followingId } });
      // Send notification
      await notificationService.create({
        receiverId: followingId,
        senderId:   followerId,
        type:       'FOLLOW',
      });
      return { following: true };
    }
  },

  async isFollowing(followerId: string, followingId: string) {
    const f = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: followerId, following_id: followingId } },
    });
    return !!f;
  },

  async checkBulk(followerId: string, targetIds: string[]) {
    if (!targetIds.length) return {};
    const rows = await prisma.follow.findMany({
      where: { follower_id: followerId, following_id: { in: targetIds } },
      select: { following_id: true },
    });
    const set = new Set(rows.map((r) => r.following_id));
    return Object.fromEntries(targetIds.map((id) => [id, set.has(id)]));
  },

  async getFollowers(userId: string) {
    const rows = await prisma.follow.findMany({
      where: { following_id: userId },
      include: {
        follower: {
          select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => r.follower);
  },

  async getFollowing(userId: string) {
    const rows = await prisma.follow.findMany({
      where: { follower_id: userId },
      include: {
        following: {
          select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });
    return rows.map((r) => r.following);
  },

  async getCounts(userId: string) {
    const [followers, following] = await Promise.all([
      prisma.follow.count({ where: { following_id: userId } }),
      prisma.follow.count({ where: { follower_id: userId } }),
    ]);
    return { followers, following };
  },

  async getSubscriptionFeed(userId: string, safeMode = false) {
    const followingRows = await prisma.follow.findMany({
      where: { follower_id: userId },
      select: { following_id: true },
    });
    const authorIds = followingRows.map((r) => r.following_id);
    if (!authorIds.length) return [];

    return prisma.post.findMany({
      where: {
        deleted_at:  null,
        author_id:   { in: authorIds },
        ...(safeMode ? { is_nsfw: false } : {}),
      },
      orderBy: { created_at: 'desc' },
      take:    50,
      include: {
        author: { select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true } },
        tags:   { include: { tag: true } },
        _count: { select: { votes: true, repaws: true, comments: true } },
      },
    });
  },
};
