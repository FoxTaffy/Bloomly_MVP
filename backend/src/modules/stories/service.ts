import prisma from '../../config/prisma.js';

const STORY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const storiesService = {
  async getActiveStories() {
    const since = new Date(Date.now() - STORY_TTL_MS);
    return prisma.story.findMany({
      where: {
        created_at: { gte: since },
        deleted_at: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            display_name: true,
            avatar_url: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  },

  async createStory(userId: string, imageUrl?: string) {
    const expires_at = new Date(Date.now() + STORY_TTL_MS);
    return prisma.story.create({
      data: {
        user_id: userId,
        image_url: imageUrl ?? null,
        expires_at,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            display_name: true,
            avatar_url: true,
          },
        },
      },
    });
  },

  async deleteStory(storyId: string, userId: string) {
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { user_id: true, deleted_at: true },
    });
    if (!story || story.deleted_at) return null;
    if (story.user_id !== userId) return false; // not owner

    return prisma.story.update({
      where: { id: storyId },
      data: { deleted_at: new Date() },
    });
  },

  async getStoriesByUser(userId: string) {
    const since = new Date(Date.now() - STORY_TTL_MS);
    return prisma.story.findMany({
      where: {
        user_id: userId,
        created_at: { gte: since },
        deleted_at: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            display_name: true,
            avatar_url: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  },
};
