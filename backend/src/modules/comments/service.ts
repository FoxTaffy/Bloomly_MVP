import prisma from '../../config/prisma.js';

const commentInclude = {
  user: { select: { id: true, username: true, display_name: true, avatar_url: true } },
  _count: { select: { replies: true } },
};

export const commentService = {
  async getComments(postId: string) {
    return await prisma.comment.findMany({
      where: { post_id: postId, parent_comment_id: null, deleted_at: null },
      include: {
        ...commentInclude,
        replies: {
          where: { deleted_at: null },
          include: commentInclude,
          orderBy: { created_at: 'asc' },
        },
      },
      orderBy: { created_at: 'asc' },
    });
  },

  async createComment(data: { postId: string; userId: string; content: string; parentCommentId?: string }) {
    const { postId, userId, content, parentCommentId } = data;

    const post = await prisma.post.findFirst({ where: { id: postId, deleted_at: null } });
    if (!post) throw new Error('Пост не найден');

    const comment = await prisma.comment.create({
      data: {
        post_id: postId,
        user_id: userId,
        content,
        parent_comment_id: parentCommentId ?? null,
      },
      include: commentInclude,
    });

    // Notify post author (if not self-comment)
    if (post.author_id !== userId) {
      await prisma.notification.create({
        data: {
          user_id: post.author_id,
          actor_id: userId,
          type: 'comment',
          entity_id: comment.id,
        },
      });
    }

    // If reply - notify parent comment author
    if (parentCommentId) {
      const parent = await prisma.comment.findUnique({ where: { id: parentCommentId } });
      if (parent && parent.user_id !== userId) {
        await prisma.notification.create({
          data: {
            user_id: parent.user_id,
            actor_id: userId,
            type: 'comment',
            entity_id: comment.id,
          },
        });
      }
    }

    return comment;
  },

  async updateComment(commentId: string, userId: string, content: string) {
    const comment = await prisma.comment.findFirst({ where: { id: commentId, deleted_at: null } });
    if (!comment) throw new Error('Комментарий не найден');
    if (comment.user_id !== userId) throw new Error('Нет прав на редактирование');

    return await prisma.comment.update({
      where: { id: commentId },
      data: { content, updated_at: new Date() },
      include: commentInclude,
    });
  },

  async deleteComment(commentId: string, userId: string, userRole: string) {
    const comment = await prisma.comment.findFirst({ where: { id: commentId, deleted_at: null } });
    if (!comment) throw new Error('Комментарий не найден');
    if (comment.user_id !== userId && userRole !== 'moderator' && userRole !== 'admin') {
      throw new Error('Нет прав на удаление');
    }
    return await prisma.comment.update({
      where: { id: commentId },
      data: { deleted_at: new Date() },
    });
  },

  async toggleVote(userId: string, commentId: string, value: 1 | -1) {
    return await prisma.$transaction(async (tx) => {
      const comment = await tx.comment.findFirst({ where: { id: commentId, deleted_at: null } });
      if (!comment) throw new Error('Комментарий не найден');

      const existing = await tx.commentVote.findUnique({
        where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
      });

      if (existing) {
        if (existing.value === value) {
          await tx.commentVote.delete({
            where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
          });
        } else {
          await tx.commentVote.update({
            where: { user_id_comment_id: { user_id: userId, comment_id: commentId } },
            data: { value },
          });
        }
      } else {
        await tx.commentVote.create({ data: { user_id: userId, comment_id: commentId, value } });
      }

      const votes = await tx.commentVote.findMany({ where: { comment_id: commentId } });
      const rating = votes.reduce((acc, v) => acc + v.value, 0);

      return await tx.comment.update({ where: { id: commentId }, data: { rating } });
    });
  },
};
