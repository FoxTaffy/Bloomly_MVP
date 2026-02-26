import prisma from '../../config/prisma.js';
import type { UpdateUserInput } from './types.js';

// Fields exposed in public profile responses (never email, password, role)
const PUBLIC_SELECT = {
  id:           true,
  username:     true,
  display_name: true,
  bio:          true,
  avatar_url:   true,
  banner_url:   true,
  status:       true,
  persona:      true,
  likes:        true,
  dislikes:     true,
  accent_color: true,
  created_at:   true,
  badge_type:   true,
  website:      true,
  location:     true,
  pronouns:     true,
} as const;

export const usersService = {
  async getUserById(id: string) {
    return prisma.user.findUnique({
      where: { id, deleted_at: null },
      select: {
        ...PUBLIC_SELECT,
        _count: { select: { followers: true, following: true } },
      },
    });
  },

  async updateUser(id: string, data: UpdateUserInput) {
    return prisma.user.update({
      where: { id, deleted_at: null },
      data,
      select: PUBLIC_SELECT,
    });
  },

  async searchUsers(query: string, limit = 8) {
    const q = query.trim();
    if (!q) return [];
    return prisma.user.findMany({
      where: {
        deleted_at: null,
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { display_name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: PUBLIC_SELECT,
      take: limit,
      orderBy: { created_at: 'desc' },
    });
  },

  async getRecommendedUsers(currentUserId: string, limit = 4) {
    // Grab users who have posted recently, excluding self
    const active = await prisma.post.findMany({
      where: { deleted_at: null, author_id: { not: currentUserId } },
      orderBy: { created_at: 'desc' },
      select: { author: { select: PUBLIC_SELECT } },
      distinct: ['author_id'],
      take: limit,
    });
    const authors = active.map((p) => p.author);
    if (authors.length >= limit) return authors;
    // Fill remainder with newest users
    const existingIds = new Set(authors.map((u) => u.id));
    existingIds.add(currentUserId);
    const extras = await prisma.user.findMany({
      where: { id: { notIn: Array.from(existingIds) }, deleted_at: null },
      select: PUBLIC_SELECT,
      take: limit - authors.length,
      orderBy: { created_at: 'desc' },
    });
    return [...authors, ...extras];
  },
};
