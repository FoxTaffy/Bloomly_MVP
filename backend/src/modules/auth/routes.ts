import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { registerHandler, loginHandler } from './controller.js';
import type { JwtPayload } from './types.js';

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
      return reply.send({
        success: true,
        data: { user: { id: payload.id, role: payload.role } },
        error: null,
      });
    },
  );
}
