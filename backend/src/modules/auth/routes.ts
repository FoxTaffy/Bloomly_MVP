import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  registerHandler, loginHandler, statsHandler,
  forgotPasswordHandler, resetPasswordHandler, changePasswordHandler,
  verifyEmailHandler, resendOtpHandler,
  requestUnfreezeHandler, confirmUnfreezeHandler, exportDataHandler,
  requestEmailChangeHandler, confirmEmailChangeHandler,
  totpSetupHandler, totpConfirmHandler,
  email2faEnableHandler, email2faConfirmHandler,
  disable2faHandler, loginVerify2faHandler, loginResend2faHandler,
  oauthRedirectHandler, oauthCallbackHandler,
  linkInitHandler, getLinkedAccountsHandler, unlinkAccountHandler,
  refreshHandler, logoutHandler,
  listSessionsHandler, revokeSessionHandler, revokeOtherSessionsHandler,
} from './controller.js';
import type { JwtPayload } from './types.js';
import prisma from '../../config/prisma.js';
import { isAdult } from '../../lib/age.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function authRoutes(fastify: FastifyInstance) {
  // ── Публичные ────────────────────────────────────────────────────────────────
  fastify.get('/stats', statsHandler);

  // ── Email/password flow ───────────────────────────────────────────────────────
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object', required: ['username', 'email', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-zA-Z0-9_]+$' },
          email:    { type: 'string', format: 'email', maxLength: 254 },
          password: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
    // Каждая регистрация шлёт письмо: без своего лимита её можно было гонять по глобальным 600/мин
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, registerHandler);

  fastify.post('/verify-email', {
    schema: {
      body: {
        type: 'object', required: ['email', 'code'],
        properties: {
          email:    { type: 'string', format: 'email' },
          code:     { type: 'string', minLength: 6, maxLength: 6 },
          remember: { type: 'boolean' },
        },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, verifyEmailHandler);

  fastify.post('/resend-otp', {
    schema: {
      body: {
        type: 'object', required: ['email', 'purpose'],
        properties: {
          email:   { type: 'string', format: 'email' },
          purpose: { type: 'string', enum: ['register', 'reset', 'unfreeze'] },
        },
      },
    },
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, resendOtpHandler);

  fastify.post('/unfreeze/request', {
    schema: {
      body: {
        type: 'object', required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, requestUnfreezeHandler);

  fastify.post('/unfreeze/verify', {
    schema: {
      body: {
        type: 'object', required: ['email', 'code'],
        properties: {
          email:    { type: 'string', format: 'email' },
          code:     { type: 'string', minLength: 6, maxLength: 6 },
          remember: { type: 'boolean' },
        },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, confirmUnfreezeHandler);

  fastify.post('/login', {
    schema: {
      body: {
        type: 'object', required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
          remember: { type: 'boolean' },
        },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, loginHandler);

  fastify.post('/forgot-password', {
    schema: {
      body: {
        type: 'object', required: ['email'],
        properties: { email: { type: 'string', format: 'email' } },
      },
    },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, forgotPasswordHandler);

  fastify.post('/reset-password', {
    schema: {
      body: {
        type: 'object', required: ['email', 'code', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          code:     { type: 'string', minLength: 6, maxLength: 6 },
          password: { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, resetPasswordHandler);

  fastify.post('/login/2fa/verify', {
    schema: {
      body: {
        type: 'object', required: ['mfaToken', 'code'],
        properties: {
          mfaToken: { type: 'string', minLength: 1 },
          code:     { type: 'string', minLength: 6, maxLength: 6 },
          remember: { type: 'boolean' },
        },
      },
    },
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, loginVerify2faHandler);

  fastify.post('/login/2fa/resend', {
    schema: {
      body: {
        type: 'object', required: ['mfaToken'],
        properties: { mfaToken: { type: 'string', minLength: 1 } },
      },
    },
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, loginResend2faHandler);

  fastify.post('/export-data', {
    schema: {
      body: {
        type: 'object', required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
    config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
  }, exportDataHandler);

  // ── OAuth ─────────────────────────────────────────────────────────────────────
  fastify.get('/oauth/:provider',     oauthRedirectHandler);
  fastify.get('/callback/:provider',  oauthCallbackHandler);

  // ── Привязка OAuth-аккаунтов (требует JWT) ────────────────────────────────────
  const auth: import('fastify').RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  fastify.post('/change-password', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword:     { type: 'string', minLength: 8, maxLength: 128 },
        },
      },
    },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, changePasswordHandler as any);

  fastify.post('/change-email/request', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, requestEmailChangeHandler as any);

  fastify.post('/change-email/confirm', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object', required: ['code', 'newEmail'],
        properties: {
          code:     { type: 'string', minLength: 6, maxLength: 6 },
          newEmail: { type: 'string', format: 'email', maxLength: 254 },
        },
      },
    },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, confirmEmailChangeHandler as any);

  // ── Двухфакторная аутентификация (требует JWT) ────────────────────────────────
  fastify.post('/2fa/totp/setup', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, totpSetupHandler as any);

  fastify.post('/2fa/totp/confirm', {
    onRequest: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 6, maxLength: 6 } } } },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, totpConfirmHandler as any);

  fastify.post('/2fa/email/enable', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, email2faEnableHandler as any);

  fastify.post('/2fa/email/confirm', {
    onRequest: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 6, maxLength: 6 } } } },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, email2faConfirmHandler as any);

  fastify.post('/2fa/disable', {
    onRequest: [fastify.authenticate],
    schema: { body: { type: 'object', properties: { password: { type: 'string' } } } },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, disable2faHandler as any);

  fastify.get('/link-init/:provider',          auth, linkInitHandler as any);
  fastify.get('/linked-accounts',              auth, getLinkedAccountsHandler as any);
  fastify.delete('/linked-accounts/:provider', auth, unlinkAccountHandler as any);

  // ── Активные сессии / устройства (требует JWT) ────────────────────────────────
  fastify.get('/sessions',                auth, listSessionsHandler as any);
  fastify.delete('/sessions/other',       auth, revokeOtherSessionsHandler as any);
  fastify.delete('/sessions/:id',         auth, revokeSessionHandler as any);

  // ── Профиль (требует JWT) ─────────────────────────────────────────────────────
  fastify.get(
    '/me',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as JwtPayload;
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true, username: true, email: true, role: true,
          display_name: true, avatar_url: true, avatar_video_url: true, bio: true, status: true,
          subscription_tier: true, profile_theme: true, profile_bg_url: true,
          profile_frame: true, is_verified: true, verification_type: true,
          badge_type: true, email_verified: true, onboarding_done: true,
          payment_region: true, birth_date: true, two_factor_method: true,
        },
      });
      if (!user) {
        return reply.code(401).send({ success: false, data: null, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      }
      const { birth_date, ...publicUser } = user;
      return reply.send({ success: true, data: { user: { ...publicUser, is_adult: isAdult(birth_date) } }, error: null });
    },
  );

  // ── Token rotation ────────────────────────────────────────────────────────────
  fastify.post('/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, refreshHandler);
  fastify.post('/logout',  { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, logoutHandler);
}
