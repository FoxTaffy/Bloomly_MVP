import prisma from '../../config/prisma.js';
import { applyViewAffinity } from '../posts/service.js';

export const analyticsService = {
  async trackActivity(input: { userId: string; postId: string; type: string; duration?: number }) {
    const { userId, postId, type, duration } = input;

    // Verify post exists (may have been deleted between page load and tracking)
    const postExists = await prisma.post.findFirst({
      where: { id: postId, deleted_at: null },
      select: { id: true },
    });
    if (!postExists) return null;

    const activity = await prisma.userActivity.create({
      data: {
        user_id: userId,
        post_id: postId,
        type,
        duration,
      },
    });

    // A view is a much weaker signal than an explicit like, but it should still nudge the
    // same behavioral tag/keyword affinity that drives feed ranking (see Feed algorithm v1).
    if (type === 'VIEW') {
      await applyViewAffinity(userId, postId, duration).catch(() => {});
    }

    return activity;
  },
};
