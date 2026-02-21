import { prisma } from '../../lib/prisma.js';

export const postService = {
  async toggleVote(userId: string, postId: string, voteType: 'UP' | 'DOWN') {
    return await prisma.$transaction(async (tx) => {
      const existingVote = await tx.vote.findUnique({
        where: {
          userId_postId: { userId, postId }
        }
      });

      if (existingVote) {
        if (existingVote.type === voteType) {
          await tx.vote.delete({ where: { id: existingVote.id } });
        } else {
          await tx.vote.update({
            where: { id: existingVote.id },
            data: { type: voteType }
          });
        }
      } else {
        await tx.vote.create({
          data: { userId, postId, type: voteType }
        });
      }

      const votes = await tx.vote.findMany({ where: { postId } });
      const newRating = votes.reduce((acc, v) => acc + (v.type === 'UP' ? 1 : -1), 0);

      return await tx.post.update({
        where: { id: postId },
        data: { rating: newRating }
      });
    });
  }
};