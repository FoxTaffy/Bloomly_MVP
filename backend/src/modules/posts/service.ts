import prisma from '../../config/prisma.js';
import type { CreatePostInput, PostSortBy } from './types.js';

export const postService = {
  async createPost(input: CreatePostInput) {
    const { content, authorId, isNsfw = false } = input;
    return prisma.post.create({
      data: { content, author_id: authorId, is_nsfw: isNsfw },
      include: {
        author: { select: { id: true, username: true, display_name: true } },
      },
    });
  },

  async getPosts(sortBy: PostSortBy = 'date') {
    return prisma.post.findMany({
      where: { deleted_at: null },
      orderBy: sortBy === 'rating' ? { rating: 'desc' } : { created_at: 'desc' },
      include: {
        author: { select: { id: true, username: true, display_name: true } },
      },
    });
  },

  async toggleVote(userId: string, postId: string, value: 1 | -1) {
    return prisma.$transaction(async (tx) => {
      const existingVote = await tx.vote.findUnique({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });

      if (existingVote && existingVote.deleted_at === null) {
        if (existingVote.value === value) {
          // Same vote → retract it (soft delete)
          await tx.vote.update({
            where: { user_id_post_id: { user_id: userId, post_id: postId } },
            data: { deleted_at: new Date() },
          });
        } else {
          // Opposite vote → flip it
          await tx.vote.update({
            where: { user_id_post_id: { user_id: userId, post_id: postId } },
            data: { value },
          });
        }
      } else if (existingVote && existingVote.deleted_at !== null) {
        // Previously retracted → restore with the new value
        await tx.vote.update({
          where: { user_id_post_id: { user_id: userId, post_id: postId } },
          data: { value, deleted_at: null },
        });
      } else {
        // First-time vote
        await tx.vote.create({
          data: { user_id: userId, post_id: postId, value },
        });
      }

      // Recalculate rating from active (non-deleted) votes only
      const activeVotes = await tx.vote.findMany({
        where: { post_id: postId, deleted_at: null },
      });
      const newRating = activeVotes.reduce((acc, v) => acc + v.value, 0);

      return tx.post.update({
        where: { id: postId },
        data: { rating: newRating },
        include: {
          author: { select: { id: true, username: true } },
        },
      });
    });
  },
};
