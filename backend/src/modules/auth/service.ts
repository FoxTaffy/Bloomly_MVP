import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { authenticator } from 'otplib';
import { toDataURL as qrcodeToDataURL } from 'qrcode';
import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { sendOtpEmail } from './email.service.js';
import { encryptTotpSecret, decryptTotpSecret } from '../../lib/totpCrypto.js';
import type { RegisterInput } from './types.js';

/** Криптографически стойкий 6-значный код */
function genCode(): string {
  return randomInt(100_000, 1_000_000).toString();
}

// ── OTP helpers ───────────────────────────────────────────────────────────────

type OtpPurpose = 'register' | 'reset' | 'unfreeze' | 'change_email' | 'login_2fa' | 'enable_2fa_email';

async function createOtp(email: string, purpose: OtpPurpose) {
  await prisma.emailOtp.deleteMany({ where: { email, purpose, used: false } });
  const code = genCode();
  await prisma.emailOtp.create({
    data: { email, code, purpose, expires_at: new Date(Date.now() + 15 * 60 * 1000) },
  });
  return code;
}

async function verifyOtp(email: string, code: string, purpose: OtpPurpose) {
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
  async resendOtp(email: string, purpose: 'register' | 'reset' | 'unfreeze') {
    const e = email.toLowerCase().trim();
    // Письмо шлём только тому, у кого аккаунт в подходящем состоянии: иначе эндпоинт
    // без авторизации рассылает коды на любые адреса. Для остальных — молча ничего не делаем
    // (как requestPasswordReset), чтобы не раскрывать наличие аккаунта.
    const user = await prisma.user.findFirst({
      where: { email: e, deleted_at: null },
      select: { email_verified: true, frozen_at: true },
    });
    const allowed =
      purpose === 'register' ? !!user && !user.email_verified :
      purpose === 'reset'    ? !!user :
      /* unfreeze */           !!user?.frozen_at;
    if (!allowed) return;

    const code = await createOtp(e, purpose);
    await sendOtpEmail(e, code, purpose);
  }

  /**
   * Вход по email + пароль. Не фильтрует по deleted_at/frozen_at — возвращает
   * учётку в любом состоянии, чтобы контроллер мог отличить "неверный пароль"
   * от "аккаунт заморожен/забанен" и показать понятное сообщение.
   */
  async loginUser(email: string, password: string) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user || !user.password) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    const { password: _pw, ...rest } = user;
    return rest;
  }

  /**
   * Экспорт своих данных — доступен даже забаненным/замороженным аккаунтам
   * (для этого и повторяем проверку пароля вместо переиспользования сессии).
   * Не включает переписку (сообщения зашифрованы на клиенте).
   */
  async exportUserData(email: string, password: string) {
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (!user || !user.password) throw new Error('Неверный email или пароль');

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('Неверный email или пароль');

    const [posts, comments, wallet] = await Promise.all([
      prisma.post.findMany({
        where: { author_id: user.id },
        select: { id: true, content: true, is_nsfw: true, rating: true, created_at: true, deleted_at: true },
        orderBy: { created_at: 'desc' },
      }),
      prisma.comment.findMany({
        where: { author_id: user.id },
        select: { id: true, post_id: true, content: true, created_at: true, deleted_at: true },
        orderBy: { created_at: 'desc' },
      }),
      prisma.wallet.findUnique({ where: { user_id: user.id }, select: { balance: true } }),
    ]);

    const { password: _pw, ...profile } = user;
    return { profile, posts, comments, wallet, exported_at: new Date().toISOString() };
  }

  /** Запрос кода разморозки — только если аккаунт реально заморожен */
  async requestUnfreeze(email: string) {
    const e = email.toLowerCase().trim();
    const user = await prisma.user.findFirst({ where: { email: e, deleted_at: null, frozen_at: { not: null } } });
    if (!user) return; // silent — не палим наличие/статус аккаунта

    const code = await createOtp(e, 'unfreeze');
    await sendOtpEmail(e, code, 'unfreeze');
  }

  /** Подтверждение кода разморозки — снимает frozen_at/frozen_reason */
  async confirmUnfreeze(email: string, code: string) {
    const e = email.toLowerCase().trim();
    await verifyOtp(e, code, 'unfreeze');

    const user = await prisma.user.findFirst({ where: { email: e, deleted_at: null } });
    if (!user) throw new Error('Пользователь не найден');

    await prisma.user.update({ where: { id: user.id }, data: { frozen_at: null, frozen_reason: null, warn_count: 0 } });
    await prisma.autoModLog.create({
      data: { user_id: user.id, action: 'unfreeze', reason: 'Разморожен пользователем через подтверждение по email', category: 'manual', score: 0 },
    });

    return user;
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
    const user = await prisma.user.findFirst({ where: { email: e, deleted_at: null }, select: { id: true } });
    await prisma.user.updateMany({ where: { email: e, deleted_at: null }, data: { password: hashed } });
    // A password reset is often triggered because the account was compromised — leaving
    // whatever sessions an attacker already holds valid would defeat the point. Sign out
    // everywhere and require signing back in with the new password.
    if (user) {
      await prisma.refreshToken.updateMany({ where: { user_id: user.id, revoked: false }, data: { revoked: true } });
    }
  }

  /**
   * Change password while logged in. If the account already has a password,
   * the current one must be supplied and match. OAuth-only accounts (no
   * password yet) may set one without providing `currentPassword`.
   */
  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string, currentTokenHash?: string) {
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
    // Same rationale as resetPassword: a stolen session shouldn't survive the legitimate
    // user changing their password. Keep the session making this request alive (like
    // revokeOtherSessionsHandler does for the equivalent explicit action).
    await prisma.refreshToken.updateMany({
      where: {
        user_id: userId, revoked: false,
        ...(currentTokenHash ? { token_hash: { not: currentTokenHash } } : {}),
      },
      data: { revoked: true },
    });
  }

  /** Смена email Step 1 — код отправляется на ТЕКУЩУЮ (старую) почту */
  async requestEmailChange(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId, deleted_at: null }, select: { email: true } });
    if (!user) throw new Error('Пользователь не найден');

    const code = await createOtp(user.email, 'change_email');
    await sendOtpEmail(user.email, code, 'change_email');
    return { email: user.email };
  }

  /** Смена email Step 2 — код с старой почты подтверждает переход на новую */
  async confirmEmailChange(userId: string, code: string, newEmail: string) {
    const user = await prisma.user.findUnique({ where: { id: userId, deleted_at: null }, select: { email: true } });
    if (!user) throw new Error('Пользователь не найден');

    const ne = newEmail.toLowerCase().trim();
    if (ne === user.email.toLowerCase()) throw new Error('Это уже ваш текущий email');

    await verifyOtp(user.email, code, 'change_email');

    const taken = await prisma.user.findFirst({ where: { email: { equals: ne, mode: 'insensitive' }, deleted_at: null } });
    if (taken) throw new Error('Этот email уже используется');

    try {
      await prisma.user.update({ where: { id: userId }, data: { email: ne, email_verified: true } });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('Этот email уже используется');
      }
      throw error;
    }
    return ne;
  }

  // ── Двухфакторная аутентификация ─────────────────────────────────────────────
  // Пользователь может иметь только один активный метод одновременно ('totp'
  // либо 'email'); подтверждение одного метода всегда снимает другой.

  /** Шаг 1 подключения TOTP — сгенерировать секрет (ещё не активирован) + QR-код */
  async setupTotp(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId, deleted_at: null }, select: { email: true, two_factor_method: true } });
    if (!user) throw new Error('Пользователь не найден');
    // Перезапись секрета при активной 2FA отдавала бы аккаунт тому, у кого есть access-токен:
    // сначала отключите текущий метод (это требует пароль), потом подключайте новый.
    if (user.two_factor_method) throw new Error('Сначала отключите текущую двухфакторную аутентификацию');

    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: userId }, data: { totp_secret: encryptTotpSecret(secret) } });

    const otpauthUrl = authenticator.keyuri(user.email, 'Bloomly', secret);
    const qrDataUrl = await qrcodeToDataURL(otpauthUrl);
    return { secret, qrDataUrl };
  }

  /** Шаг 2 подключения TOTP — подтвердить код из приложения-аутентификатора */
  async confirmTotp(userId: string, code: string) {
    const user = await prisma.user.findUnique({ where: { id: userId, deleted_at: null }, select: { totp_secret: true } });
    if (!user?.totp_secret) throw new Error('Сначала подключите приложение-аутентификатор');

    const secret = decryptTotpSecret(user.totp_secret);
    if (!authenticator.verify({ token: code, secret })) throw new Error('Неверный код');

    await prisma.user.update({ where: { id: userId }, data: { two_factor_method: 'totp' } });
  }

  /** Шаг 1 подключения email-2FA — отправить код на собственную почту */
  async enableEmail2fa(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId, deleted_at: null }, select: { email: true } });
    if (!user) throw new Error('Пользователь не найден');

    const code = await createOtp(user.email, 'enable_2fa_email');
    await sendOtpEmail(user.email, code, 'enable_2fa_email');
    return { email: user.email };
  }

  /** Шаг 2 подключения email-2FA — подтвердить код */
  async confirmEmail2fa(userId: string, code: string) {
    const user = await prisma.user.findUnique({ where: { id: userId, deleted_at: null }, select: { email: true } });
    if (!user) throw new Error('Пользователь не найден');

    await verifyOtp(user.email, code, 'enable_2fa_email');
    await prisma.user.update({ where: { id: userId }, data: { two_factor_method: 'email', totp_secret: null } });
  }

  /** Отключение 2FA (любого активного метода) — требует текущий пароль */
  async disableTwoFactor(userId: string, password: string | undefined) {
    const user = await prisma.user.findUnique({ where: { id: userId, deleted_at: null }, select: { password: true } });
    if (!user) throw new Error('Пользователь не найден');

    if (user.password) {
      if (!password) throw new Error('Введите текущий пароль');
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) throw new Error('Неверный пароль');
    }

    await prisma.user.update({ where: { id: userId }, data: { two_factor_method: null, totp_secret: null } });
  }

  /** Проверка кода второго фактора при входе (вызывается после проверки mfaToken) */
  async verifyLoginTwoFactor(userId: string, code: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId, deleted_at: null },
      select: { email: true, two_factor_method: true, totp_secret: true },
    });
    if (!user) throw new Error('Пользователь не найден');

    if (user.two_factor_method === 'totp') {
      if (!user.totp_secret) throw new Error('Неверный код');
      const secret = decryptTotpSecret(user.totp_secret);
      if (!authenticator.verify({ token: code, secret })) throw new Error('Неверный код');
    } else if (user.two_factor_method === 'email') {
      await verifyOtp(user.email, code, 'login_2fa');
    } else {
      throw new Error('Двухфакторная аутентификация не включена');
    }
  }

  /** Повторная отправка кода второго фактора при входе (только для метода email) */
  async resendLoginTwoFactor(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId, deleted_at: null },
      select: { email: true, two_factor_method: true },
    });
    if (!user || user.two_factor_method !== 'email') return;

    const code = await createOtp(user.email, 'login_2fa');
    await sendOtpEmail(user.email, code, 'login_2fa');
  }
}
