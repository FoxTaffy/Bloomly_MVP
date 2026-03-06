import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './service.js';
import { buildOAuthUrl, handleOAuthCallback, findOrCreateOAuthUser, OAuthProvider } from './oauth.service.js';
import prisma from '../../config/prisma.js';
import type { RegisterInput, LoginInput } from './types.js';

const authService = new AuthService();

// ── Вспомогательный селект полного профиля ────────────────────────────────────
const FULL_USER_SELECT = {
  id: true, username: true, email: true, role: true,
  display_name: true, avatar_url: true, bio: true, status: true,
  subscription_tier: true, profile_theme: true, profile_bg_url: true,
  profile_frame: true, is_verified: true, verification_type: true,
  badge_type: true, email_verified: true, onboarding_done: true,
} as const;

function issueToken(request: FastifyRequest, id: string, role: string) {
  return request.server.jwt.sign({ id, role }, { expiresIn: '7d' });
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
  request: FastifyRequest<{ Body: { email: string; code: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { email, code } = request.body;
    await authService.verifyEmail(email, code);

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deleted_at: null },
      select: FULL_USER_SELECT,
    });
    if (!user) return reply.code(400).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Пользователь не найден' } });

    const token = issueToken(request, user.id, user.role);
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
    const { email, password } = request.body;
    const user = await authService.loginUser(email, password);

    if (!user) {
      return reply.code(401).send({
        success: false, data: null,
        error: { code: 'AUTH_FAILED', message: 'Неверный email или пароль' },
      });
    }

    const token = issueToken(request, user.id, user.role);
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
    const oauthUser = await handleOAuthCallback(provider, code, state);
    const { user } = await findOrCreateOAuthUser(provider, oauthUser);

    const token = issueToken(request, user.id, user.role);
    // Передаём токен через URL (frontend забирает его и кладёт в storage)
    return reply.redirect(302, `${FRONTEND_URL()}/auth/callback?token=${token}`);
  } catch (e: any) {
    console.error('[OAuth callback error]', e);
    return reply.redirect(302, `${FRONTEND_URL()}/auth?error=oauth_failed`);
  }
};

