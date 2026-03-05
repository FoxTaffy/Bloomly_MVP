import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { registerHandler, loginHandler, statsHandler, forgotPasswordHandler, resetPasswordHandler } from './controller.js';
import type { JwtPayload } from './types.js';
import prisma from '../../config/prisma.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const registerSchema = {
  body: {
    type: 'object',
    required: ['username', 'email', 'password'],
    properties: {
      username: { type: 'string', minLength: 3 },
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 6 },
    },
  },
};

const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 1 },
    },
  },
};

export async function authRoutes(fastify: FastifyInstance) {
  // Public stats
  fastify.get('/stats', statsHandler);

  // Password reset (no auth)
  fastify.post('/forgot-password', {
    schema: { body: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } },
  }, forgotPasswordHandler);
  fastify.post('/reset-password', {
    schema: { body: { type: 'object', required: ['code', 'password'], properties: { code: { type: 'string' }, password: { type: 'string', minLength: 6 } } } },
  }, resetPasswordHandler);

  fastify.post('/register', { schema: registerSchema }, registerHandler);

  // Strict rate-limit for login: max 10 attempts per minute per IP (brute-force protection)
  fastify.post(
    '/login',
    { schema: loginSchema, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    loginHandler,
  );

  fastify.get(
    '/me',
    { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = request.user as JwtPayload;
      // Fetch full user record so the client always gets username, display_name, avatar_url, etc.
      const user = await prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          display_name: true,
          avatar_url: true,
          bio: true,
          status: true,
          subscription_tier: true,
          profile_theme: true,
          profile_bg_url: true,
          profile_frame: true,
          is_verified: true,
          verification_type: true,
          badge_type: true,
        },
      });
      if (!user) {
        return reply.code(401).send({ success: false, data: null, error: { code: 'USER_NOT_FOUND', message: 'User not found' } });
      }
      return reply.send({ success: true, data: { user }, error: null });
    },
  );
}
