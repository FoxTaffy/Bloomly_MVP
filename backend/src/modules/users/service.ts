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
} as const;

export const usersService = {
  async getUserById(id: string) {
    return prisma.user.findUnique({
      where: { id, deleted_at: null },
      select: PUBLIC_SELECT,
    });
  },

  async updateUser(id: string, data: UpdateUserInput) {
    return prisma.user.update({
      where: { id, deleted_at: null },
      data,
      select: PUBLIC_SELECT,
    });
  },
};
