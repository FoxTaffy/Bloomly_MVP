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

  /** Mutual follows: people who follow userId AND whom userId follows */
  async getFriends(userId: string) {
    const [followerRows, followingRows] = await Promise.all([
      prisma.follow.findMany({ where: { following_id: userId }, select: { follower_id: true } }),
      prisma.follow.findMany({ where: { follower_id: userId }, select: { following_id: true } }),
    ]);
    const followersSet = new Set(followerRows.map((r) => r.follower_id));
    const mutualIds = followingRows.map((r) => r.following_id).filter((id) => followersSet.has(id));
    if (!mutualIds.length) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: mutualIds }, deleted_at: null },
      select: { id: true, username: true, display_name: true, avatar_url: true, badge_type: true },
    });
    return users;
  },

  /** Check mutual follow status between two users */
  async isFriends(userA: string, userB: string) {
    const [aFollowsB, bFollowsA] = await Promise.all([
      prisma.follow.findUnique({ where: { follower_id_following_id: { follower_id: userA, following_id: userB } } }),
      prisma.follow.findUnique({ where: { follower_id_following_id: { follower_id: userB, following_id: userA } } }),
    ]);
    return { aFollowsB: !!aFollowsB, bFollowsA: !!bFollowsA, friends: !!aFollowsB && !!bFollowsA };
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
        groupPosts: { include: { group: { select: { id: true, slug: true, name: true, avatar_url: true } } } },
      },
    });
  },
};
