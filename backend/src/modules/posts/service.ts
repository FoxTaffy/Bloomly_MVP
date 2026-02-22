import prisma from '../../config/prisma.js';

function extractHashtags(content: string): string[] {
  const matches = content.match(/#[\w\u0400-\u04FF]+/g) || [];
  return [...new Set(matches.map(tag => tag.toLowerCase()))];
}

export const postService = {
  async createPost(data: { content: string; authorId: string; isNsfw?: boolean; groupId?: string }) {
    const { content, authorId, isNsfw = false, groupId } = data;
    const tags = extractHashtags(content);

    return await prisma.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          content,
          author_id: authorId,
          is_nsfw: isNsfw,
          group_id: groupId ?? null,
        },
        include: {
          author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        },
      });

      for (const tag of tags) {
        const hashtag = await tx.hashtag.upsert({
          where: { tag },
          create: { tag },
          update: {},
        });
        await tx.postHashtag.upsert({
          where: { post_id_hashtag_id: { post_id: post.id, hashtag_id: hashtag.id } },
          create: { post_id: post.id, hashtag_id: hashtag.id },
          update: {},
        });
      }

      return post;
    });
  },

  async repost(data: { originalPostId: string; authorId: string; content?: string }) {
    const { originalPostId, authorId, content } = data;
    return await prisma.post.create({
      data: {
        content: content || '',
        author_id: authorId,
        original_post_id: originalPostId,
      },
      include: {
        author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        original: {
          include: {
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
          },
        },
      },
    });
  },

  async getPost(postId: string) {
    return await prisma.post.findFirst({
      where: { id: postId, deleted_at: null },
      include: {
        author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        hashtags: { include: { hashtag: true } },
        original: {
          include: {
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
          },
        },
        _count: { select: { comments: true, saved_by: true } },
      },
    });
  },

  async getPosts(sortBy: 'date' | 'rating' = 'date', page = 1, limit = 20, filters?: {
    userId?: string;
    groupId?: string;
    hashtag?: string;
  }) {
    const skip = (page - 1) * limit;
    const where: any = { deleted_at: null };

    if (filters?.userId) where.author_id = filters.userId;
    if (filters?.groupId) where.group_id = filters.groupId;
    if (filters?.hashtag) {
      where.hashtags = {
        some: {
          hashtag: { tag: filters.hashtag.toLowerCase().replace('#', '') },
        },
      };
    }

    return await prisma.post.findMany({
      where,
      skip,
      take: limit,
      orderBy: sortBy === 'rating'
        ? [{ rating: 'desc' }, { created_at: 'desc' }]
        : { created_at: 'desc' },
      include: {
        author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        hashtags: { include: { hashtag: true } },
        _count: { select: { comments: true, saved_by: true } },
      },
    });
  },

  async updatePost(postId: string, userId: string, data: { content?: string }) {
    const post = await prisma.post.findFirst({ where: { id: postId, deleted_at: null } });
    if (!post) throw new Error('Пост не найден');
    if (post.author_id !== userId) throw new Error('Нет прав на редактирование');

    return await prisma.post.update({
      where: { id: postId },
      data: { ...data, updated_at: new Date() },
    });
  },

  async deletePost(postId: string, userId: string, userRole: string) {
    const post = await prisma.post.findFirst({ where: { id: postId, deleted_at: null } });
    if (!post) throw new Error('Пост не найден');
    if (post.author_id !== userId && userRole !== 'moderator' && userRole !== 'admin') {
      throw new Error('Нет прав на удаление');
    }
    return await prisma.post.update({
      where: { id: postId },
      data: { deleted_at: new Date() },
    });
  },

  async toggleVote(userId: string, postId: string, value: 1 | -1) {
    return await prisma.$transaction(async (tx) => {
      const post = await tx.post.findFirst({ where: { id: postId, deleted_at: null } });
      if (!post) throw new Error('Пост не найден');

      const existing = await tx.postVote.findUnique({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });

      if (existing) {
        if (existing.value === value) {
          await tx.postVote.delete({ where: { user_id_post_id: { user_id: userId, post_id: postId } } });
        } else {
          await tx.postVote.update({
            where: { user_id_post_id: { user_id: userId, post_id: postId } },
            data: { value },
          });
        }
      } else {
        await tx.postVote.create({ data: { user_id: userId, post_id: postId, value } });
      }

      const votes = await tx.postVote.findMany({ where: { post_id: postId } });
      const rating = votes.reduce((acc, v) => acc + v.value, 0);

      return await tx.post.update({ where: { id: postId }, data: { rating } });
    });
  },

  async toggleSave(userId: string, postId: string) {
    const existing = await prisma.savedPost.findUnique({
      where: { user_id_post_id: { user_id: userId, post_id: postId } },
    });

    if (existing) {
      await prisma.savedPost.delete({
        where: { user_id_post_id: { user_id: userId, post_id: postId } },
      });
      return { saved: false };
    } else {
      await prisma.savedPost.create({ data: { user_id: userId, post_id: postId } });
      return { saved: true };
    }
  },

  async getSavedPosts(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const saved = await prisma.savedPost.findMany({
      where: { user_id: userId },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        post: {
          include: {
            author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
            hashtags: { include: { hashtag: true } },
            _count: { select: { comments: true } },
          },
        },
      },
    });
    return saved.map(s => s.post);
  },
};
