import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import type { RegisterInput } from './types.js';

// ── In-memory reset tokens (TTL = 15 min) ────────────────────────────────────
const resetTokens = new Map<string, { userId: string; expiresAt: number }>()

function genCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export class AuthService {
  async createUser(data: RegisterInput) {
    const { password, username } = data;
    const email = data.email.toLowerCase().trim();
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      return await prisma.$transaction(async (tx) => {
        // ── Release unique slots held by soft-deleted users ─────────────
        // Randomize email/username so the unique constraint is freed.
        const suffix = `_del_${Date.now()}`
        await tx.user.updateMany({
          where: { email, deleted_at: { not: null } },
          data: { email: email + suffix },
        });
        await tx.user.updateMany({
          where: { username, deleted_at: { not: null } },
          data: { username: username + suffix },
        });

        const newUser = await tx.user.create({
          data: { email, username, password: hashedPassword, likes: [], dislikes: [] },
          select: {
            id: true,
            email: true,
            username: true,
            role: true,
            created_at: true,
          },
        });

        await tx.wallet.create({ data: { user_id: newUser.id } });

        return newUser;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fields = (error.meta?.target as string[]) ?? [];
        if (fields.includes('email')) throw new Error('Email is already registered');
        if (fields.includes('username')) throw new Error('Username is already taken');
        throw new Error('User with this data already exists');
      }
      throw error;
    }
  }

  async loginUser(email: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deleted_at: null },
    });
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    const { password: _password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // ── Stats ───────────────────────────────────────────────────────────────────
  async getPublicStats() {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
    const [users, posts, online] = await Promise.all([
      prisma.user.count({ where: { deleted_at: null } }),
      prisma.post.count({ where: { deleted_at: null } }),
      prisma.user.count({ where: { deleted_at: null, updated_at: { gte: fifteenMinutesAgo } } }),
    ])
    return { users, posts, online }
  }

  // ── Forgot password ─────────────────────────────────────────────────────────
  async requestPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email, deleted_at: null } })
    if (!user) return null // silent — не раскрываем существование аккаунта

    // Очищаем старые токены этого пользователя
    for (const [token, val] of resetTokens.entries()) {
      if (val.userId === user.id) resetTokens.delete(token)
    }

    const code = genCode()
    resetTokens.set(code, { userId: user.id, expiresAt: Date.now() + 15 * 60 * 1000 })

    // В реальном продакшне здесь был бы sendEmail(email, code)
    // Пока выводим в консоль для тестирования
    console.log(`[RESET] код для ${email}: ${code}`)

    return code
  }

  async resetPassword(code: string, newPassword: string) {
    const entry = resetTokens.get(code)
    if (!entry) throw new Error('Неверный или устаревший код')
    if (Date.now() > entry.expiresAt) {
      resetTokens.delete(code)
      throw new Error('Срок действия кода истёк')
    }

    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({ where: { id: entry.userId }, data: { password: hashed } })
    resetTokens.delete(code)
  }
}
