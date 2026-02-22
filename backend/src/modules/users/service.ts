import prisma from '../../config/prisma.js';

const publicUserSelect = {
  id: true,
  username: true,
  display_name: true,
  status_text: true,
  persona: true,
  city: true,
  avatar_url: true,
  header_url: true,
  likes_list: true,
  dislikes_list: true,
  role: true,
  is_blocked: true,
  created_at: true,
};

export const userService = {
  async getUserByUsername(username: string) {
    return await prisma.user.findUnique({
      where: { username },
      select: {
        ...publicUserSelect,
        user_badges: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
          },
        },
      },
    });
  },

  async getUserById(id: string) {
    return await prisma.user.findUnique({
      where: { id },
      select: {
        ...publicUserSelect,
        user_badges: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
          },
        },
      },
    });
  },

  async updateUser(userId: string, data: {
    display_name?: string;
    status_text?: string;
    persona?: string;
    city?: string;
    avatar_url?: string;
    header_url?: string;
    likes_list?: string[];
    dislikes_list?: string[];
  }) {
    return await prisma.user.update({
      where: { id: userId },
      data: { ...data, updated_at: new Date() },
      select: publicUserSelect,
    });
  },

  async toggleFollow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new Error('Нельзя подписаться на себя');

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

      // Create notification
      await prisma.notification.create({
        data: {
          user_id: followingId,
          actor_id: followerId,
          type: 'follow',
          entity_id: followingId,
        },
      });

      return { following: true };
    }
  },

  async toggleBlock(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) throw new Error('Нельзя заблокировать себя');

    const existing = await prisma.block.findUnique({
      where: { blocker_id_blocked_id: { blocker_id: blockerId, blocked_id: blockedId } },
    });

    if (existing) {
      await prisma.block.delete({
        where: { blocker_id_blocked_id: { blocker_id: blockerId, blocked_id: blockedId } },
      });
      return { blocked: false };
    } else {
      await prisma.block.create({ data: { blocker_id: blockerId, blocked_id: blockedId } });
      // Remove follow relationship if it exists
      await prisma.follow.deleteMany({
        where: {
          OR: [
            { follower_id: blockerId, following_id: blockedId },
            { follower_id: blockedId, following_id: blockerId },
          ],
        },
      });
      return { blocked: true };
    }
  },

  async getFollowers(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const follows = await prisma.follow.findMany({
      where: { following_id: userId },
      skip,
      take: limit,
      include: { follower: { select: publicUserSelect } },
      orderBy: { created_at: 'desc' },
    });
    return follows.map(f => f.follower);
  },

  async getFollowing(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const follows = await prisma.follow.findMany({
      where: { follower_id: userId },
      skip,
      take: limit,
      include: { following: { select: publicUserSelect } },
      orderBy: { created_at: 'desc' },
    });
    return follows.map(f => f.following);
  },

  async isFollowing(followerId: string, followingId: string) {
    const follow = await prisma.follow.findUnique({
      where: { follower_id_following_id: { follower_id: followerId, following_id: followingId } },
    });
    return !!follow;
  },

  async isBlocked(blockerId: string, blockedId: string) {
    const block = await prisma.block.findUnique({
      where: { blocker_id_blocked_id: { blocker_id: blockerId, blocked_id: blockedId } },
    });
    return !!block;
  },

  async getSettings(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, role: true, is_blocked: true },
    });
    return user;
  },
};
