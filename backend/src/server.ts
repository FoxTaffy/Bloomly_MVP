import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import * as dotenv from 'dotenv';
import { authRoutes } from './modules/auth/routes.js';
import { postsRoutes } from './modules/posts/routes.js';
import { usersRoutes } from './modules/users/routes.js';

dotenv.config();

const fastify = Fastify({ logger: true });

fastify.register(cors, { origin: true });
fastify.register(jwt, { secret: process.env.JWT_SECRET || 'bloomly_secret_2026' });
fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });

fastify.decorate(
  'authenticate',
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  },
);

fastify.setErrorHandler((error, _request, reply) => {
  const statusCode = error.statusCode ?? 500;
  reply.code(statusCode).send({
    success: false,
    data: null,
    error: {
      code: error.code || 'SERVER_ERROR',
      message: error.message,
    },
  });
});

fastify.register(authRoutes, { prefix: '/api/auth' });
fastify.register(postsRoutes, { prefix: '/api/posts' });
fastify.register(usersRoutes, { prefix: '/api/users' });

fastify.get('/health', async () => ({
  success: true,
  data: { message: 'Bloomly Backend is running' },
  error: null,
}));

const start = async () => {
  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
