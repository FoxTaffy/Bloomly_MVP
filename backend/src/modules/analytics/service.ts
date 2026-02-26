import prisma from '../../config/prisma.js';

export const analyticsService = {
  async trackActivity(input: { userId: string; postId: string; type: string; duration?: number }) {
    const { userId, postId, type, duration } = input;
    
    // Verify post exists (may have been deleted between page load and tracking)
    const postExists = await prisma.post.findFirst({
      where: { id: postId, deleted_at: null },
      select: { id: true },
    });
    if (!postExists) return null;

    return prisma.userActivity.create({
      data: {
        user_id: userId,
        post_id: postId,
        type,
        duration,
      },
    });
  },
};
