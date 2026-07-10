import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { sendOtpEmail } from './email.service.js';
import type { RegisterInput } from './types.js';

/** Криптографически стойкий 6-значный код */
function genCode(): string {
  return randomInt(100_000, 1_000_000).toString();
}

// ── OTP helpers ───────────────────────────────────────────────────────────────

async function createOtp(email: string, purpose: 'register' | 'reset') {
  await prisma.emailOtp.deleteMany({ where: { email, purpose, used: false } });
  const code = genCode();
  await prisma.emailOtp.create({
    data: { email, code, purpose, expires_at: new Date(Date.now() + 15 * 60 * 1000) },
  });
  return code;
}

async function verifyOtp(email: string, code: string, purpose: 'register' | 'reset') {
  const otp = await prisma.emailOtp.findFirst({
    where: { email, code, purpose, used: false },
    orderBy: { created_at: 'desc' },
  });
  if (!otp) throw new Error('Неверный код');
  if (otp.expires_at < new Date()) {
    await prisma.emailOtp.delete({ where: { id: otp.id } });
    throw new Error('Срок действия кода истёк');
  }
  await prisma.emailOtp.update({ where: { id: otp.id }, data: { used: true } });
}

// ── AuthService ───────────────────────────────────────────────────────────────

export class AuthService {
  /** Step 1 регистрации — создать пользователя + отправить OTP на email */
  async createUser(data: RegisterInput) {
    const { password } = data;
    const username = data.username.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!username || username.length < 3) throw new Error('Имя пользователя должно содержать минимум 3 символа (только a–z, 0–9, _)');
    if (username.length > 30) throw new Error('Имя пользователя не может быть длиннее 30 символов');
    if (password.length < 8) throw new Error('Пароль должен содержать минимум 8 символов');
    if (password.length > 128) throw new Error('Пароль слишком длинный');
    const email = data.email.toLowerCase().trim();
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const user = await prisma.$transaction(async (tx) => {
        const suffix = `_del_${Date.now()}`;
        await tx.user.updateMany({
          where: { email, deleted_at: { not: null } },
          data: { email: email + suffix },
        });
        await tx.user.updateMany({
          where: { username, deleted_at: { not: null } },
          data: { username: username + suffix },
        });

        const newUser = await tx.user.create({
          data: { email, username, password: hashedPassword, email_verified: false, likes: [], dislikes: [] },
          select: { id: true, email: true, username: true, role: true, created_at: true },
        });

        await tx.wallet.create({ data: { user_id: newUser.id } });
        return newUser;
      });

      // Отправляем OTP (вне транзакции — не откатываем новый аккаунт из-за ошибки почты)
      const code = await createOtp(email, 'register');
      await sendOtpEmail(email, code, 'register');

      return user;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fields = (error.meta?.target as string[]) ?? [];
        if (fields.includes('email'))    throw new Error('Email уже зарегистрирован');
        if (fields.includes('username')) throw new Error('Имя пользователя уже занято');
        throw new Error('Пользователь с такими данными уже существует');
      }
      throw error;
    }
  }

  /** Step 2 регистрации — подтвердить email по OTP */
  async verifyEmail(email: string, code: string) {
    const e = email.toLowerCase().trim();
    await verifyOtp(e, code, 'register');
    await prisma.user.updateMany({ where: { email: e, deleted_at: null }, data: { email_verified: true } });
  }

  /** Повторная отправка OTP */
  async resendOtp(email: string, purpose: 'register' | 'reset') {
    const e = email.toLowerCase().trim();
    const code = await createOtp(e, purpose);
    await sendOtpEmail(e, code, purpose);
  }

  /** Вход по email + пароль */
  async loginUser(email: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deleted_at: null },
    });
    if (!user || !user.password) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    const { password: _pw, ...rest } = user;
    return rest;
  }

  /** Сброс пароля Step 1 — отправить код */
  async requestPasswordReset(email: string) {
    const e = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({ where: { email: e, deleted_at: null } });
    if (!user) return; // silent

    const code = await createOtp(e, 'reset');
    await sendOtpEmail(e, code, 'reset');
  }

  /** Сброс пароля Step 2 — установить новый пароль */
  async resetPassword(email: string, code: string, newPassword: string) {
    if (newPassword.length < 8) throw new Error('Пароль должен содержать минимум 8 символов');
    if (newPassword.length > 128) throw new Error('Пароль слишком длинный');
    const e = email.toLowerCase().trim();
    await verifyOtp(e, code, 'reset');
    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.updateMany({ where: { email: e, deleted_at: null }, data: { password: hashed } });
  }

  /**
   * Change password while logged in. If the account already has a password,
   * the current one must be supplied and match. OAuth-only accounts (no
   * password yet) may set one without providing `currentPassword`.
   */
  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    if (newPassword.length < 8) throw new Error('Пароль должен содержать минимум 8 символов');
    if (newPassword.length > 128) throw new Error('Пароль слишком длинный');

    const user = await prisma.user.findUnique({ where: { id: userId, deleted_at: null }, select: { password: true } });
    if (!user) throw new Error('Пользователь не найден');

    if (user.password) {
      if (!currentPassword) throw new Error('Введите текущий пароль');
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) throw new Error('Неверный текущий пароль');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
  }
}
