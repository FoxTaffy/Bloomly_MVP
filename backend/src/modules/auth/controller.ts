import { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, randomBytes } from 'crypto';
import { AuthService } from './service.js';
import { buildOAuthUrl, handleOAuthCallback, findOrCreateOAuthUser, OAuthProvider } from './oauth.service.js';
import { parseDeviceName, getClientIp } from './device.util.js';
import prisma from '../../config/prisma.js';
import type { RegisterInput, LoginInput, JwtPayload } from './types.js';

const authService = new AuthService();

// ── Вспомогательный селект полного профиля ────────────────────────────────────
const FULL_USER_SELECT = {
  id: true, username: true, email: true, role: true,
  display_name: true, avatar_url: true, bio: true, status: true,
  subscription_tier: true, profile_theme: true, profile_bg_url: true,
  profile_frame: true, is_verified: true, verification_type: true,
  badge_type: true, email_verified: true, onboarding_done: true,
  payment_region: true,
} as const;

// ── 15-минутный access token ──────────────────────────────────────────────────
function issueAccessToken(request: FastifyRequest, id: string, role: string) {
  return request.server.jwt.sign({ id, role }, { expiresIn: '15m' });
}

// ── Выдача refresh token: запись в БД + httpOnly cookie ───────────────────────
// remember=true  → persistent 30-day cookie + 30-day DB token
// remember=false → session cookie (no maxAge) + 24-hour DB token
async function issueRefreshToken(
  request: FastifyRequest,
  reply: FastifyReply,
  userId: string,
  remember = false,
): Promise<void> {
  const raw     = randomBytes(40).toString('hex');
  const hash    = createHash('sha256').update(raw).digest('hex');
  const ttlMs   = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiry  = new Date(Date.now() + ttlMs);
  const userAgent  = request.headers['user-agent'];
  const ipAddress  = getClientIp(request);

  await prisma.refreshToken.create({
    data: {
      user_id: userId, token_hash: hash, expires_at: expiry, remember,
      device_name: parseDeviceName(userAgent),
      user_agent: userAgent ?? null,
      ip_address: ipAddress ?? null,
    },
  });

  const cookieOpts: Parameters<typeof reply.setCookie>[2] = {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path:     '/api/auth',
  };
  if (remember) cookieOpts.maxAge = 30 * 24 * 60 * 60;

  reply.setCookie('refresh_token', raw, cookieOpts);
}

// ── Статистика ────────────────────────────────────────────────────────────────
export const statsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const onlineMap: Map<string, Set<any>> | undefined = (req.server as any).onlineUsers
  const online = onlineMap ? onlineMap.size : 0
  const [users, posts] = await Promise.all([
    prisma.user.count({ where: { deleted_at: null } }),
    prisma.post.count({ where: { deleted_at: null } }),
  ])
  return reply.send({ success: true, data: { users, posts, online }, error: null })
}

// ── Регистрация (Step 1) ───────────────────────────────────────────────────────
export const registerHandler = async (
  request: FastifyRequest<{ Body: RegisterInput }>,
  reply: FastifyReply,
) => {
  try {
    const user = await authService.createUser(request.body);
    return reply.code(201).send({
      success: true,
      data: { user, message: 'Код подтверждения отправлен на почту' },
      error: null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return reply.code(400).send({ success: false, data: null, error: { code: 'REGISTRATION_ERROR', message } });
  }
};

// ── Подтверждение email (Step 2) ──────────────────────────────────────────────
export const verifyEmailHandler = async (
  request: FastifyRequest<{ Body: { email: string; code: string; remember?: boolean } }>,
  reply: FastifyReply,
) => {
  try {
    const { email, code, remember = false } = request.body;
    await authService.verifyEmail(email, code);

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deleted_at: null },
      select: FULL_USER_SELECT,
    });
    if (!user) return reply.code(400).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Пользователь не найден' } });

    const token = issueAccessToken(request, user.id, user.role);
    await issueRefreshToken(request, reply, user.id, remember);
    return reply.send({ success: true, data: { token, user }, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'VERIFY_ERROR', message: e.message } });
  }
};

// ── Повторная отправка OTP ────────────────────────────────────────────────────
export const resendOtpHandler = async (
  request: FastifyRequest<{ Body: { email: string; purpose: 'register' | 'reset' } }>,
  reply: FastifyReply,
) => {
  try {
    await authService.resendOtp(request.body.email, request.body.purpose);
    return reply.send({ success: true, data: { message: 'Код отправлен повторно' }, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'RESEND_ERROR', message: e.message } });
  }
};

// ── Вход ──────────────────────────────────────────────────────────────────────
export const loginHandler = async (
  request: FastifyRequest<{ Body: LoginInput }>,
  reply: FastifyReply,
) => {
  try {
    const { email, password, remember = false } = request.body;
    const user = await authService.loginUser(email, password);

    if (!user) {
      return reply.code(401).send({
        success: false, data: null,
        error: { code: 'AUTH_FAILED', message: 'Неверный email или пароль' },
      });
    }

    if (!user.email_verified) {
      return reply.code(403).send({
        success: false, data: null,
        error: { code: 'EMAIL_NOT_VERIFIED', message: 'Подтвердите email перед входом' },
      });
    }

    const token = issueAccessToken(request, user.id, user.role);
    await issueRefreshToken(request, reply, user.id, remember);
    const fullUser = await prisma.user.findUnique({ where: { id: user.id }, select: FULL_USER_SELECT });

    return reply.send({
      success: true,
      data: { token, user: fullUser ?? { id: user.id, username: user.username, email: user.email, role: user.role } },
      error: null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return reply.code(500).send({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message } });
  }
};

// ── Сброс пароля ──────────────────────────────────────────────────────────────
export const forgotPasswordHandler = async (
  request: FastifyRequest<{ Body: { email: string } }>,
  reply: FastifyReply,
) => {
  try {
    await authService.requestPasswordReset(request.body.email);
    return reply.send({ success: true, data: { message: 'Если аккаунт существует, код отправлен' }, error: null });
  } catch {
    return reply.code(500).send({ success: false, data: null, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  }
};

export const resetPasswordHandler = async (
  request: FastifyRequest<{ Body: { email: string; code: string; password: string } }>,
  reply: FastifyReply,
) => {
  try {
    await authService.resetPassword(request.body.email, request.body.code, request.body.password);
    return reply.send({ success: true, data: { message: 'Пароль успешно изменён' }, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'RESET_ERROR', message: e.message } });
  }
};

// ── Смена пароля (требует JWT) ─────────────────────────────────────────────────
export const changePasswordHandler = async (
  request: FastifyRequest<{ Body: { currentPassword?: string; newPassword: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id } = request.user as JwtPayload;
    await authService.changePassword(id, request.body.currentPassword, request.body.newPassword);
    return reply.send({ success: true, data: { message: 'Пароль успешно изменён' }, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'CHANGE_PASSWORD_ERROR', message: e.message } });
  }
};

// ── OAuth: редирект на провайдера ─────────────────────────────────────────────
export const oauthRedirectHandler = async (
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) => {
  const provider = request.params.provider as OAuthProvider;
  const validProviders: OAuthProvider[] = ['google', 'yandex', 'twitter', 'twitch'];
  if (!validProviders.includes(provider)) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_PROVIDER', message: 'Unknown OAuth provider' } });
  }

  try {
    const { url } = buildOAuthUrl(provider);
    return reply.redirect(302, url);
  } catch (e: any) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'OAUTH_ERROR', message: e.message } });
  }
};

// ── OAuth: callback от провайдера ─────────────────────────────────────────────
const FRONTEND_URL = () => process.env.FRONTEND_URL ?? 'http://localhost:5173';

export const oauthCallbackHandler = async (
  request: FastifyRequest<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>,
  reply: FastifyReply,
) => {
  const provider = request.params.provider as OAuthProvider;
  const { code, state, error } = request.query;

  if (error || !code || !state) {
    return reply.redirect(302, `${FRONTEND_URL()}/auth?error=oauth_denied`);
  }

  try {
    const { oauthUser, linkUserId } = await handleOAuthCallback(provider, code, state);

    // ── РЕЖИМ ПРИВЯЗКИ (пользователь уже залогинен) ───────────────────────────
    if (linkUserId) {
      const conflict = await prisma.oAuthAccount.findUnique({
        where: { provider_provider_id: { provider, provider_id: oauthUser.id } },
      });
      if (conflict && conflict.user_id !== linkUserId) {
        return reply.redirect(302, `${FRONTEND_URL()}/settings/profile?section=sec-security&error=already_taken`);
      }
      await prisma.oAuthAccount.upsert({
        where: { provider_provider_id: { provider, provider_id: oauthUser.id } },
        create: { user_id: linkUserId, provider, provider_id: oauthUser.id },
        update: {},
      });
      return reply.redirect(302, `${FRONTEND_URL()}/settings/profile?section=sec-security&linked=${provider}`);
    }

    // ── ОБЫЧНЫЙ ВХОД / РЕГИСТРАЦИЯ ────────────────────────────────────────────
    const { user } = await findOrCreateOAuthUser(provider, oauthUser);
    const token = issueAccessToken(request, user.id, user.role);
    // OAuth-вход не спрашивает "запомнить меня" — всегда выдаём persistent-сессию,
    // иначе вход через Google/Yandex/etc. живёт всего 24ч и разлогинивает раньше обычного
    await issueRefreshToken(request, reply, user.id, true);
    return reply.redirect(302, `${FRONTEND_URL()}/auth/callback?token=${token}`);
  } catch (e: any) {
    console.error('[OAuth callback error]', e instanceof Error ? e.message : 'Unknown error');
    return reply.redirect(302, `${FRONTEND_URL()}/auth?error=oauth_failed`);
  }
};

// ── OAuth: начало привязки аккаунта (требует JWT) ─────────────────────────────
export const linkInitHandler = async (
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) => {
  const provider = request.params.provider as OAuthProvider;
  const validProviders: OAuthProvider[] = ['google', 'yandex', 'twitter', 'twitch'];
  if (!validProviders.includes(provider)) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_PROVIDER', message: 'Unknown OAuth provider' } });
  }
  const { id } = request.user as JwtPayload;
  const { url } = buildOAuthUrl(provider, id);
  return reply.send({ success: true, data: { url }, error: null });
};

// ── Список привязанных OAuth-аккаунтов ────────────────────────────────────────
export const getLinkedAccountsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id } = request.user as JwtPayload;
  const accounts = await prisma.oAuthAccount.findMany({
    where: { user_id: id },
    select: { provider: true, provider_id: true },
  });
  return reply.send({ success: true, data: { accounts }, error: null });
};

// ── Удаление привязки OAuth-провайдера ────────────────────────────────────────
export const unlinkAccountHandler = async (
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
) => {
  const { id } = request.user as JwtPayload;
  const provider = request.params.provider;

  // Проверяем что останется хотя бы один способ входа
  const [user, otherAccountsCount] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { password: true } }),
    prisma.oAuthAccount.count({ where: { user_id: id, provider: { not: provider } } }),
  ]);
  if (!user?.password && otherAccountsCount === 0) {
    return reply.code(400).send({
      success: false, data: null,
      error: { code: 'LAST_AUTH_METHOD', message: 'Нельзя отвязать единственный способ входа' },
    });
  }

  await prisma.oAuthAccount.deleteMany({ where: { user_id: id, provider } });
  return reply.send({ success: true, data: null, error: null });
};

// ── Обновление access token по refresh token ──────────────────────────────────
export const refreshHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const raw = (request.cookies as any)?.refresh_token as string | undefined;
  if (!raw) {
    return reply.code(401).send({ success: false, data: null, error: { code: 'NO_REFRESH_TOKEN', message: 'Refresh token not provided' } });
  }

  const hash   = createHash('sha256').update(raw).digest('hex');
  const record = await prisma.refreshToken.findUnique({ where: { token_hash: hash } });

  if (!record || record.revoked || record.expires_at < new Date()) {
    reply.clearCookie('refresh_token', { path: '/api/auth' });
    return reply.code(401).send({ success: false, data: null, error: { code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token invalid or expired' } });
  }

  // Ротация: инвалидируем старый, выдаём новый
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } });

  const user = await prisma.user.findUnique({
    where: { id: record.user_id, deleted_at: null },
    select: FULL_USER_SELECT,
  });
  if (!user) {
    reply.clearCookie('refresh_token', { path: '/api/auth' });
    return reply.code(401).send({ success: false, data: null, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
  }

  const token = issueAccessToken(request, user.id, user.role);
  // Сохраняем remember-статус при ротации — иначе persistent-сессия
  // превращалась бы в session-cookie на первом же обновлении токена
  await issueRefreshToken(request, reply, user.id, record.remember);

  return reply.send({ success: true, data: { token, user }, error: null });
};

// ── Выход (инвалидация всех refresh token пользователя) ──────────────────────
export const logoutHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const raw = (request.cookies as any)?.refresh_token as string | undefined;
  if (raw) {
    const hash = createHash('sha256').update(raw).digest('hex');
    const token = await prisma.refreshToken.findFirst({ where: { token_hash: hash }, select: { user_id: true } });
    if (token) {
      await prisma.refreshToken.updateMany({
        where: { user_id: token.user_id, revoked: false },
        data:  { revoked: true },
      });
    }
  }
  reply.clearCookie('refresh_token', { path: '/api/auth' });
  return reply.send({ success: true, data: null, error: null });
};

// ── Список активных сессий (устройств) ────────────────────────────────────────
export const listSessionsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id } = request.user as JwtPayload;
  const raw = (request.cookies as any)?.refresh_token as string | undefined;
  const currentHash = raw ? createHash('sha256').update(raw).digest('hex') : null;

  const sessions = await prisma.refreshToken.findMany({
    where: { user_id: id, revoked: false, expires_at: { gt: new Date() } },
    orderBy: { last_used_at: 'desc' },
    select: {
      id: true, device_name: true, ip_address: true,
      created_at: true, last_used_at: true, token_hash: true,
    },
  });

  return reply.send({
    success: true,
    data: {
      sessions: sessions.map(({ token_hash, ...s }) => ({ ...s, current: token_hash === currentHash })),
    },
    error: null,
  });
};

// ── Завершение конкретной сессии (устройства) ─────────────────────────────────
export const revokeSessionHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  const { id: userId } = request.user as JwtPayload;
  const { id: sessionId } = request.params;

  const session = await prisma.refreshToken.findUnique({ where: { id: sessionId } });
  if (!session || session.user_id !== userId) {
    return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Сессия не найдена' } });
  }

  await prisma.refreshToken.update({ where: { id: sessionId }, data: { revoked: true } });

  const raw = (request.cookies as any)?.refresh_token as string | undefined;
  if (raw && createHash('sha256').update(raw).digest('hex') === session.token_hash) {
    reply.clearCookie('refresh_token', { path: '/api/auth' });
  }

  return reply.send({ success: true, data: null, error: null });
};

// ── Завершение всех сессий, кроме текущей ─────────────────────────────────────
export const revokeOtherSessionsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id: userId } = request.user as JwtPayload;
  const raw = (request.cookies as any)?.refresh_token as string | undefined;
  const currentHash = raw ? createHash('sha256').update(raw).digest('hex') : null;

  await prisma.refreshToken.updateMany({
    where: {
      user_id: userId, revoked: false,
      ...(currentHash ? { token_hash: { not: currentHash } } : {}),
    },
    data: { revoked: true },
  });

  return reply.send({ success: true, data: null, error: null });
};

