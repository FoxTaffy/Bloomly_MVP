import prisma from '../../config/prisma.js';

export const groupService = {
  async getGroups(type?: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return await prisma.group.findMany({
      where: type ? { type } : {},
      skip,
      take: limit,
      include: {
        creator: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        _count: { select: { user_groups: true, posts: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  },

  async getGroupBySlug(slug: string) {
    return await prisma.group.findUnique({
      where: { slug },
      include: {
        creator: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        _count: { select: { user_groups: true, posts: true } },
      },
    });
  },

  async getGroupById(id: string) {
    return await prisma.group.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        _count: { select: { user_groups: true, posts: true } },
      },
    });
  },

  async createGroup(data: { name: string; slug: string; description?: string; type?: string; creatorId: string }) {
    const { name, slug, description, type = 'creative', creatorId } = data;
    return await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: { name, slug, description, type, creator_id: creatorId },
        include: {
          creator: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        },
      });
      // Add creator as owner member
      await tx.userGroup.create({
        data: { group_id: group.id, user_id: creatorId, role: 'owner' },
      });
      return group;
    });
  },

  async toggleMembership(groupId: string, userId: string) {
    const existing = await prisma.userGroup.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });

    if (existing) {
      if (existing.role === 'owner') throw new Error('Владелец не может покинуть группу');
      await prisma.userGroup.delete({
        where: { group_id_user_id: { group_id: groupId, user_id: userId } },
      });
      return { member: false };
    } else {
      await prisma.userGroup.create({
        data: { group_id: groupId, user_id: userId, role: 'member' },
      });
      return { member: true };
    }
  },

  async isMember(groupId: string, userId: string) {
    const membership = await prisma.userGroup.findUnique({
      where: { group_id_user_id: { group_id: groupId, user_id: userId } },
    });
    return !!membership;
  },
};
