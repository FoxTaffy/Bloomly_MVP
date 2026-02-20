import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import * as dotenv from 'dotenv';
import { authRoutes } from './modules/auth/routes.js'; 
import { postsRoutes } from './modules/posts/routes.js';

dotenv.config();

const fastify = Fastify({ 
  logger: true 
});

fastify.register(cors, { origin: true });
fastify.register(jwt, { secret: process.env.JWT_SECRET || 'bloomly_secret_2026' });
// Глобальный rate-limit: не более 100 запросов в минуту с одного IP
fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });

fastify.decorate("authenticate", async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

// Централизованный обработчик ошибок
fastify.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode ?? 500;
  reply.code(statusCode).send({
    success: false,
    error: {
      code: error.code || 'SERVER_ERROR',
      message: error.message,
    },
  });
});

// Регистрируем роуты
fastify.register(authRoutes, { prefix: 'auth' });
fastify.register(postsRoutes, { prefix: 'posts' });

fastify.get('/health', async () => {
  return { success: true, message: 'Bloomly Backend is running' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    console.log('🚀 Server ready at http://localhost:8080');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
