import { registerHandler, loginHandler } from './controller.js';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// Объявляем тип для кастомного декоратора authenticate
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Схема валидации для POST /register
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

// Схема валидации для POST /login
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
  // Строгий rate-limit для логина: не более 10 попыток в минуту с одного IP (защита от брутфорса)
  fastify.post('/login', { schema: loginSchema, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, loginHandler);

  // Добавляем этот роут
  fastify.get('/me', { onRequest: [fastify.authenticate] }, async (request: any) => {
    return {
      success: true,
      user: request.user, // Здесь будут данные из JWT (id, email)
    };
  });
}