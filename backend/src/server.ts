import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import * as dotenv from 'dotenv';
import { authRoutes } from './modules/auth/routes.js';
import { postsRoutes } from './modules/posts/routes.js';
import { usersRoutes } from './modules/users/routes.js';
import { storiesRoutes } from './modules/stories/routes.js';
import analyticsRoutes from './modules/analytics/routes.js';
import { mediaRoutes } from './modules/media/routes.js';
import { followsRoutes } from './modules/follows/routes.js';
import { notificationsRoutes } from './modules/notifications/routes.js';
import { adminRoutes } from './modules/admin/routes.js';

dotenv.config();

const fastify = Fastify({ logger: true, bodyLimit: 26_214_400 }); // 25 MB

fastify.register(cors, { origin: true });
fastify.register(jwt, { secret: process.env.JWT_SECRET || 'bloomly_secret_2026' });
fastify.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  // Skip rate-limiting for WebSocket upgrade requests
  skip: (request) => request.headers.upgrade?.toLowerCase() === 'websocket',
});
fastify.register(websocket);

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
fastify.register(storiesRoutes, { prefix: '/api/stories' });
fastify.register(analyticsRoutes, { prefix: '/api/analytics' });
fastify.register(mediaRoutes, { prefix: '/api/media' });
fastify.register(followsRoutes, { prefix: '/api/follows' });
fastify.register(notificationsRoutes, { prefix: '/api/notifications' });
fastify.register(adminRoutes, { prefix: '/api/admin' });

fastify.register(async function (fastify) {
  fastify.get('/api/', { websocket: true }, (connection) => {
    connection.socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg?.type === 'ping') {
          connection.socket.send(JSON.stringify({ type: 'pong' }))
          return
        }
      } catch { /* non-JSON frame — ignore */ }
    })
    connection.socket.on('error', () => {})
  })
})

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
