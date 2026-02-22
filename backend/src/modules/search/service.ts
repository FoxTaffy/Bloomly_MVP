import prisma from '../../config/prisma.js';

export const searchService = {
  async searchUsers(query: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return await prisma.user.findMany({
      where: {
        deleted_at: null,
        is_blocked: false,
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { display_name: { contains: query, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        username: true,
        display_name: true,
        avatar_url: true,
        persona: true,
        role: true,
      },
      skip,
      take: limit,
    });
  },

  async searchPosts(query: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    return await prisma.post.findMany({
      where: {
        deleted_at: null,
        content: { contains: query, mode: 'insensitive' },
      },
      include: {
        author: { select: { id: true, username: true, display_name: true, avatar_url: true } },
        hashtags: { include: { hashtag: true } },
        _count: { select: { comments: true } },
      },
      skip,
      take: limit,
      orderBy: { created_at: 'desc' },
    });
  },

  async searchHashtags(query: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const cleanQuery = query.replace('#', '').toLowerCase();
    return await prisma.hashtag.findMany({
      where: { tag: { contains: cleanQuery, mode: 'insensitive' } },
      include: { _count: { select: { posts: true } } },
      skip,
      take: limit,
    });
  },

  async search(query: string, type?: 'users' | 'posts' | 'hashtags', page = 1, limit = 20) {
    if (!query.trim()) return { users: [], posts: [], hashtags: [] };

    if (type === 'users') return { users: await this.searchUsers(query, page, limit), posts: [], hashtags: [] };
    if (type === 'posts') return { users: [], posts: await this.searchPosts(query, page, limit), hashtags: [] };
    if (type === 'hashtags') return { users: [], posts: [], hashtags: await this.searchHashtags(query, page, limit) };

    const [users, posts, hashtags] = await Promise.all([
      this.searchUsers(query, 1, 5),
      this.searchPosts(query, 1, 10),
      this.searchHashtags(query, 1, 5),
    ]);

    return { users, posts, hashtags };
  },
};
