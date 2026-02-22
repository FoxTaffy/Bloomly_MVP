import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import * as dotenv from 'dotenv';

import { authRoutes } from './modules/auth/routes.js';
import { postsRoutes } from './modules/posts/routes.js';
import { usersRoutes } from './modules/users/routes.js';
import { commentsRoutes } from './modules/comments/routes.js';
import { groupsRoutes } from './modules/groups/routes.js';
import { conversationsRoutes } from './modules/conversations/routes.js';
import { notificationsRoutes } from './modules/notifications/routes.js';
import { searchRoutes } from './modules/search/routes.js';
import { adminRoutes } from './modules/admin/routes.js';
import { reportsRoutes } from './modules/reports/routes.js';

dotenv.config();

const fastify = Fastify({ logger: true });

fastify.register(cors, { origin: true });
fastify.register(jwt, { secret: process.env.JWT_SECRET || 'bloomly_secret_2026' });
fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });

fastify.decorate('authenticate', async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

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

// Public & auth routes
fastify.register(authRoutes, { prefix: '/api/auth' });

// Core feature routes
fastify.register(postsRoutes, { prefix: '/api/posts' });
fastify.register(usersRoutes, { prefix: '/api/users' });
fastify.register(commentsRoutes, { prefix: '/api/comments' });
fastify.register(groupsRoutes, { prefix: '/api/groups' });
fastify.register(conversationsRoutes, { prefix: '/api/conversations' });
fastify.register(notificationsRoutes, { prefix: '/api/notifications' });
fastify.register(searchRoutes, { prefix: '/api/search' });
fastify.register(reportsRoutes, { prefix: '/api/reports' });

// Admin routes
fastify.register(adminRoutes, { prefix: '/api/admin' });

fastify.get('/health', async () => {
  return { success: true, message: 'Bloomly Backend is running', version: '2.0' };
});

const start = async () => {
  try {
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
    console.log('Server ready at http://localhost:8080');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
