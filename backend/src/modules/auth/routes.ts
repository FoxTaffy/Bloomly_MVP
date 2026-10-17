import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  registerHandler, loginHandler, statsHandler, meHandler,
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
import { isAdult } from '../../lib/age.js';

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
          consent: {
            type: 'object',
            required: ['personalData', 'cookies'],
            properties: {
              personalData: { type: 'boolean' },
              cookies: { type: 'boolean' },
              marketingEmails: { type: 'boolean' },
            },
            additionalProperties: false,
          },
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
          password: { type: 'string', minLength: 1, maxLength: 128 },
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
          password: { type: 'string', minLength: 1, maxLength: 128 },
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

  fastify.post<RouteGenericOf<typeof changePasswordHandler>>('/change-password', {
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
  }, changePasswordHandler);

  fastify.post<RouteGenericOf<typeof requestEmailChangeHandler>>('/change-email/request', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, requestEmailChangeHandler);

  fastify.post<RouteGenericOf<typeof confirmEmailChangeHandler>>('/change-email/confirm', {
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
  }, confirmEmailChangeHandler);

  // ── Двухфакторная аутентификация (требует JWT) ────────────────────────────────
  fastify.post<RouteGenericOf<typeof totpSetupHandler>>('/2fa/totp/setup', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, totpSetupHandler);

  fastify.post<RouteGenericOf<typeof totpConfirmHandler>>('/2fa/totp/confirm', {
    onRequest: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 6, maxLength: 6 } } } },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, totpConfirmHandler);

  fastify.post<RouteGenericOf<typeof email2faEnableHandler>>('/2fa/email/enable', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, email2faEnableHandler);

  fastify.post<RouteGenericOf<typeof email2faConfirmHandler>>('/2fa/email/confirm', {
    onRequest: [fastify.authenticate],
    schema: { body: { type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 6, maxLength: 6 } } } },
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, email2faConfirmHandler);

  fastify.post<RouteGenericOf<typeof disable2faHandler>>('/2fa/disable', {
    onRequest: [fastify.authenticate],
    schema: { body: { type: 'object', properties: { password: { type: 'string' } } } },
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, disable2faHandler);

  fastify.get<RouteGenericOf<typeof linkInitHandler>>('/link-init/:provider',          auth, linkInitHandler);
  fastify.get<RouteGenericOf<typeof getLinkedAccountsHandler>>('/linked-accounts',              auth, getLinkedAccountsHandler);
  fastify.delete<RouteGenericOf<typeof unlinkAccountHandler>>('/linked-accounts/:provider', auth, unlinkAccountHandler);

  // ── Активные сессии / устройства (требует JWT) ────────────────────────────────
  fastify.get<RouteGenericOf<typeof listSessionsHandler>>('/sessions',                auth, listSessionsHandler);
  fastify.delete<RouteGenericOf<typeof revokeOtherSessionsHandler>>('/sessions/other',       auth, revokeOtherSessionsHandler);
  fastify.delete<RouteGenericOf<typeof revokeSessionHandler>>('/sessions/:id',         auth, revokeSessionHandler);

  // ── Профиль (требует JWT) ─────────────────────────────────────────────────────
  fastify.get('/me', { onRequest: [fastify.authenticate] }, meHandler);

  // ── Token rotation ────────────────────────────────────────────────────────────
  fastify.post('/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, refreshHandler);
  fastify.post('/logout',  { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, logoutHandler);
}
