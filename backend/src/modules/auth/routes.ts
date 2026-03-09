import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  registerHandler, loginHandler, statsHandler,
  forgotPasswordHandler, resetPasswordHandler,
  verifyEmailHandler, resendOtpHandler,
  oauthRedirectHandler, oauthCallbackHandler,
  linkInitHandler, getLinkedAccountsHandler, unlinkAccountHandler,
  refreshHandler, logoutHandler,
} from './controller.js';
import type { JwtPayload } from './types.js';
import prisma from '../../config/prisma.js';

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
          username: { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-z0-9_]+$' },
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, registerHandler);

  fastify.post('/verify-email', {
    schema: {
      body: {
        type: 'object', required: ['email', 'code'],
        properties: {
          email: { type: 'string', format: 'email' },
          code:  { type: 'string', minLength: 6, maxLength: 6 },
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
          purpose: { type: 'string', enum: ['register', 'reset'] },
        },
      },
    },
    config: { rateLimit: { max: 3, timeWindow: '1 minute' } },
  }, resendOtpHandler);

  fastify.post('/login', {
    schema: {
      body: {
        type: 'object', required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
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
  }, forgotPasswordHandler);

  fastify.post('/reset-password', {
    schema: {
      body: {
        type: 'object', required: ['email', 'code', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          code:     { type: 'string' },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, resetPasswordHandler);

  // ── OAuth ─────────────────────────────────────────────────────────────────────
  fastify.get('/oauth/:provider',     oauthRedirectHandler);
  fastify.get('/callback/:provider',  oauthCallbackHandler);

  // ── Привязка OAuth-аккаунтов (требует JWT) ────────────────────────────────────
  const auth: import('fastify').RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  fastify.get('/link-init/:provider',          auth, linkInitHandler as any);
  fastify.get('/linked-accounts',              auth, getLinkedAccountsHandler as any);
  fastify.delete('/linked-accounts/:provider', auth, unlinkAccountHandler as any);

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
          display_name: true, avatar_url: true, bio: true, status: true,
          subscription_tier: true, profile_theme: true, profile_bg_url: true,
          profile_frame: true, is_verified: true, verification_type: true,
          badge_type: true, email_verified: true, onboarding_done: true,
        },
      });
      if (!user) {
        return reply.code(401).send({ success: false, data: null, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      }
      return reply.send({ success: true, data: { user }, error: null });
    },
  );

  // ── Token rotation ────────────────────────────────────────────────────────────
  fastify.post('/refresh', refreshHandler);
  fastify.post('/logout',  logoutHandler);
}
