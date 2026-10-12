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

/** Неверных вводов на один код и на один email+назначение за окно — дальше код не проверяем. */
const OTP_MAX_ATTEMPTS = 5;

// ── Блокировка входа ─────────────────────────────────────────────────────────
// Per-IP лимит не мешает перебору с множества адресов, поэтому считаем неудачи на аккаунте.
const LOGIN_MAX_FAILURES = 10;
const TWO_FA_MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const TOTP_PERIOD_SECONDS = 30;
const LOCKED_MESSAGE = 'Слишком много неудачных попыток. Попробуйте через 15 минут';
// Хэш-заглушка: при несуществующем email тоже выполняем bcrypt, чтобы время ответа не выдавало учётку
const DUMMY_BCRYPT_HASH = bcrypt.hashSync('bloomly-dummy-password', 10);

function assertNotLocked(user: { login_locked_until: Date | null }) {
  if (user.login_locked_until && user.login_locked_until > new Date()) {
    throw Object.assign(new Error(LOCKED_MESSAGE), { statusCode: 429 });
  }
}

/** Засчитывает неудачу и при достижении порога блокирует аккаунт на LOCK_MS */
async function recordFailure(userId: string, field: 'failed_login_count' | 'failed_2fa_count', max: number) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { [field]: { increment: 1 } },
    select: { failed_login_count: true, failed_2fa_count: true },
  });
  if (updated[field] >= max) {
    await prisma.user.update({
      where: { id: userId },
      data: { failed_login_count: 0, failed_2fa_count: 0, login_locked_until: new Date(Date.now() + LOCK_MS) },
    });
  }
}

async function resetFailures(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { failed_login_count: 0, failed_2fa_count: 0, login_locked_until: null },
  });
}
const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_LOCKED_MESSAGE = 'Слишком много попыток. Запросите новый код позже';

/** Новый код не выдаём, пока попытки в окне не исчерпаны: иначе переотправка сбрасывала бы счётчик. */
export class OtpLockedError extends Error {}

/** Для потоков без авторизации (сброс, разморозка, переотправка): блокировка молча пропускается,
 *  ответ остаётся таким же, как для несуществующего аккаунта. */
async function issueOtpSilently(email: string, purpose: OtpPurpose) {
  try {
    const code = await createOtp(email, purpose);
    await sendOtpEmail(email, code, purpose);
  } catch (err) {
    if (!(err instanceof OtpLockedError)) throw err;
  }
}

async function createOtp(email: string, purpose: OtpPurpose) {
  const spent = await prisma.emailOtp.aggregate({
    where: { email, purpose, created_at: { gte: new Date(Date.now() - OTP_WINDOW_MS) } },
    _sum: { attempts: true },
  });
  if ((spent._sum.attempts ?? 0) >= OTP_MAX_ATTEMPTS) throw new OtpLockedError(OTP_LOCKED_MESSAGE);

  await prisma.emailOtp.deleteMany({ where: { email, purpose, used: false } });
  const code = genCode();
  await prisma.emailOtp.create({
    data: { email, code, purpose, expires_at: new Date(Date.now() + OTP_WINDOW_MS) },
  });
  return code;
}

async function verifyOtp(email: string, code: string, purpose: OtpPurpose) {
  // Берём действующий код по email и назначению и сравниваем его с введённым в коде приложения
  const otp = await prisma.emailOtp.findFirst({
    where: { email, purpose, used: false },
    orderBy: { created_at: 'desc' },
  });
  if (!otp) throw new Error('Неверный код');
  if (otp.expires_at < new Date()) {
    await prisma.emailOtp.delete({ where: { id: otp.id } });
    throw new Error('Срок действия кода истёк');
  }

  // Попытку засчитываем атомарно до сравнения: параллельные запросы не обходят лимит
  const counted = await prisma.emailOtp.updateMany({
    where: { id: otp.id, used: false, attempts: { lt: OTP_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) throw new Error(OTP_LOCKED_MESSAGE);
  if (otp.code !== code) throw new Error('Неверный код');

  // Одноразовость: код можно погасить только один раз, даже при гонке двух верных запросов
  const claimed = await prisma.emailOtp.updateMany({ where: { id: otp.id, used: false }, data: { used: true } });
  if (claimed.count !== 1) throw new Error('Неверный код');
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

    // Забаненный аккаунт не освобождает email: иначе бан обходится повторной регистрацией.
    // Освобождаются только email/username самоудалённых аккаунтов.
    const bannedWithEmail = await prisma.user.findFirst({ where: { email, is_banned: true }, select: { id: true } });
    if (bannedWithEmail) throw Object.assign(new Error('Не удалось зарегистрироваться с этим email'), { statusCode: 400 });

    try {
      const user = await prisma.$transaction(async (tx) => {
        const suffix = `_del_${Date.now()}`;
        await tx.user.updateMany({
          where: { email, deleted_at: { not: null }, is_banned: false },
          data: { email: email + suffix },
        });
        await tx.user.updateMany({
          where: { username, deleted_at: { not: null }, is_banned: false },
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

    await issueOtpSilently(e, purpose);
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
    if (!user || !user.password) {
      await bcrypt.compare(password, DUMMY_BCRYPT_HASH);
      return null;
    }
    assertNotLocked(user);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await recordFailure(user.id, 'failed_login_count', LOGIN_MAX_FAILURES);
      return null;
    }
    await resetFailures(user.id);

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

    await issueOtpSilently(e, 'unfreeze');
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

    await issueOtpSilently(e, 'reset');
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

    // Код пришёл на старый адрес, владение новым не доказано: сбрасываем подтверждение и просим
    // подтвердить новый email отдельным кодом. Иначе OAuth-привязка к чужому адресу (email_verified)
    // позволяла захватить чужой вход.
    try {
      await prisma.user.update({ where: { id: userId }, data: { email: ne, email_verified: false } });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Error('Этот email уже используется');
      }
      throw error;
    }
    const verifyCode = await createOtp(ne, 'register');
    await sendOtpEmail(ne, verifyCode, 'register');
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
      select: { email: true, two_factor_method: true, totp_secret: true, totp_last_step: true, login_locked_until: true },
    });
    if (!user) throw new Error('Пользователь не найден');
    assertNotLocked(user);

    if (user.two_factor_method === 'totp') {
      if (!user.totp_secret) throw new Error('Неверный код');
      const secret = decryptTotpSecret(user.totp_secret);
      // otplib по умолчанию принимает только текущее 30-секундное окно (window = 0)
      const step = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
      if (!authenticator.verify({ token: code, secret }) || user.totp_last_step === step) {
        await recordFailure(userId, 'failed_2fa_count', TWO_FA_MAX_FAILURES);
        throw new Error('Неверный код');
      }
      // Код одноразовый: фиксируем шаг атомарно, чтобы один код не прошёл дважды параллельными запросами
      const claimed = await prisma.user.updateMany({
        where: { id: userId, OR: [{ totp_last_step: null }, { totp_last_step: { lt: step } }] },
        data: { totp_last_step: step },
      });
      if (claimed.count !== 1) throw new Error('Неверный код');
      await resetFailures(userId);
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
