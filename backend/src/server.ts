// Type augmentations (authenticate / tryAuthenticate decorators, JWT user) — must load first.
import './types/fastify.js';
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
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
import { relationshipsRoutes } from './modules/relationships/routes.js';
import { messagesRoutes } from './modules/messages/routes.js';
import { friendsRoutes } from './modules/friends/routes.js';
import { groupsRoutes } from './modules/groups/routes.js';
import { verificationRoutes } from './modules/verification/routes.js';
import { dealersDenRoutes, dealersDenAdminRoutes } from './modules/dealers-den/routes.js';
import { avatarFramesRoutes, avatarFramesAdminRoutes } from './modules/avatar-frames/routes.js';
import { stickersRoutes } from './modules/stickers/routes.js';
import { shopRoutes } from './modules/shop/routes.js';
import { activitiesRoutes } from './modules/activities/routes.js';
import { automodRoutes } from './modules/automod/routes.js';
import { automationRoutes } from './modules/automation/routes.js';
import { seoRoutes } from './modules/seo/routes.js';
import { updatesRoutes } from './modules/updates/routes.js';
import { bookmarksRoutes } from './modules/bookmarks/routes.js';
import { supportRoutes } from './modules/support/routes.js';
import { walletRoutes } from './modules/wallet/routes.js';
import { realtimeRoutes } from './modules/realtime/routes.js';
import { initCronJobs } from './cron.js';
import prisma from './config/prisma.js';
import { getSetting } from './lib/settings.js';
import { isAdult } from './lib/age.js';
import { isModerator } from './lib/roles.js';
import { isDevEnv } from './lib/env.js';

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (!isDevEnv()) {
    console.error('[FATAL] JWT_SECRET env variable is not set. Refusing to start outside development/test.');
    process.exit(1);
  }
  console.warn('[WARN] JWT_SECRET is not set. Using insecure fallback for development only.');
}

const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  if (!isDevEnv()) {
    console.error('[FATAL] COOKIE_SECRET env variable is not set. Refusing to start outside development/test.');
    process.exit(1);
  }
  console.warn('[WARN] COOKIE_SECRET is not set. Using insecure fallback for development only.');
}

if (!process.env.ALLOWED_ORIGINS && !isDevEnv()) {
  console.error('[FATAL] ALLOWED_ORIGINS env variable is not set. Refusing to start in production.');
  process.exit(1);
}

// 4300 MB ceiling — covers the largest chat-attachment tier (4 GB) with headroom for
// multipart overhead. Per-tier caps (2 GB free / 4 GB lite+) are enforced in the upload
// handler itself; this is just the outer limit fastify/busboy will allow through at all.
// NOTE: if a reverse proxy (nginx, etc.) sits in front of this API, its own body-size
// limit (e.g. client_max_body_size) must be raised to match, or it will 413 first.
const MAX_UPLOAD_BYTES = 4_300 * 1024 * 1024;

// Доверяем X-Forwarded-For только от своих прокси (loopback — nginx на хосте, uniquelocal —
// docker-сеть). При trustProxy: true Fastify брал самый левый IP из заголовка, а его клиент
// подставляет сам, что обходило rate-limit. TRUST_PROXY можно задать списком IP/CIDR.
const fastify = Fastify({
  logger: process.env.NODE_ENV !== 'test',
  bodyLimit: MAX_UPLOAD_BYTES,
  trustProxy: process.env.TRUST_PROXY || 'loopback,uniquelocal',
});

// Allow specific origins in production; fall back to wildcard for development only
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : true // dev fallback
fastify.register(cors, { origin: allowedOrigins, credentials: true });
fastify.register(cookie, { secret: cookieSecret || 'bloomly_cookie_secret_dev' });
fastify.register(jwt, { secret: jwtSecret || 'bloomly_secret_dev_only' });
fastify.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });
// This is the fallback for every route that doesn't set its own `config.rateLimit`
// (auth, reports, ads, etc. already have tight per-route limits — see their routes.ts).
// A single active session easily fires 8-10 parallel GET requests per page load plus a
// persistent SSE connection and ~30s polling, and several people can share one IP behind
// NAT — 200/min made ordinary usage (not abuse) trip the limit for everyone on that IP.
fastify.register(rateLimit, {
  global: true,
  max: 600,
  timeWindow: '1 minute',
} as any);

// HTTP security headers
fastify.addHook('onSend', (_request, reply, _payload, done) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (!isDevEnv()) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  done();
});

// Maintenance mode — toggled from the admin panel (SiteSetting). Auth and
// admin routes stay open so staff can still log in and manage the platform;
// staff (moderator+) are also let through everywhere else so they can use the
// site normally while it's closed to regular users.
fastify.addHook('onRequest', async (request, reply) => {
  if (request.url.startsWith('/api/auth') || request.url.startsWith('/api/admin')) return;
  if (!(await getSetting('maintenance_mode'))) return;

  try {
    await request.jwtVerify();
    const payload = request.user as { id: string };
    const dbUser = await prisma.user.findUnique({ where: { id: payload.id }, select: { role: true, deleted_at: true } });
    if (dbUser && !dbUser.deleted_at && isModerator(dbUser.role)) return;
  } catch {
    // no/invalid token — fall through and block below
  }

  reply.code(503).send({ success: false, data: null, error: { code: 'MAINTENANCE', message: 'Платформа временно на обслуживании' } });
});

fastify.register(websocket);

fastify.decorate(
  'authenticate',
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      // Always refresh role from DB so role changes take effect without re-login
      const payload = request.user as { id: string; role: string };
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { role: true, deleted_at: true, frozen_at: true, frozen_reason: true, birth_date: true },
      });
      if (!dbUser || dbUser.deleted_at) {
        return reply.code(401).send({ success: false, data: null, error: { code: 'UNAUTHORIZED', message: 'User not found' } });
      }
      request.user.role = dbUser.role;
      request.user.is_adult = isAdult(dbUser.birth_date);
      // Frozen accounts are force-logged-out on their very next authenticated request
      // (frontend's response interceptor catches ACCOUNT_FROZEN and clears the session).
      if (dbUser.frozen_at) {
        return reply.code(403).send({
          success: false,
          data: null,
          error: { code: 'ACCOUNT_FROZEN', message: dbUser.frozen_reason || 'Аккаунт временно заморожен за подозрительную активность' },
        });
      }
    } catch (err) {
      reply.send(err);
    }
  },
);

fastify.decorate(
  'tryAuthenticate',
  async (request: FastifyRequest, _reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      const payload = request.user as { id: string; role: string };
      const dbUser = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { role: true, deleted_at: true, birth_date: true },
      });
      if (!dbUser || dbUser.deleted_at) {
        (request as { user?: unknown }).user = undefined; // guest: no user on the request
      } else {
        request.user.role = dbUser.role;
        request.user.is_adult = isAdult(dbUser.birth_date);
      }
    } catch {
      (request as { user?: unknown }).user = undefined; // guest: no user on the request
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
fastify.register(relationshipsRoutes, { prefix: '/api/relationships' });
fastify.register(messagesRoutes, { prefix: '/api/messages' });
fastify.register(friendsRoutes, { prefix: '/api/friends' });
fastify.register(groupsRoutes, { prefix: '/api/groups' });
fastify.register(verificationRoutes, { prefix: '/api/verification' });
fastify.register(dealersDenRoutes, { prefix: '/api/dealers-den' });
fastify.register(dealersDenAdminRoutes, { prefix: '/api/admin' });
fastify.register(avatarFramesRoutes, { prefix: '/api/avatar-frames' });
fastify.register(avatarFramesAdminRoutes, { prefix: '/api/admin' });
fastify.register(stickersRoutes, { prefix: '/api/stickers' });
fastify.register(shopRoutes,    { prefix: '/api/shop' });
fastify.register(activitiesRoutes, { prefix: '/api/activities' });
fastify.register(automodRoutes,    { prefix: '/api/automod' });
fastify.register(automationRoutes, { prefix: '/api/automation' });
fastify.register(updatesRoutes,    { prefix: '/api/updates' });
fastify.register(bookmarksRoutes,  { prefix: '/api/bookmarks' });
fastify.register(supportRoutes,    { prefix: '/api/support' });
fastify.register(walletRoutes,     { prefix: '/api/wallet' });
// SEO: sitemap.xml and OG-proxy endpoints (no auth required, crawlers friendly)
fastify.register(seoRoutes);

// WebSocket (/api/) и GET /api/users/online
fastify.register(realtimeRoutes);

fastify.get('/health', async () => ({
  success: true,
  data: { message: 'Bloomly Backend is running' },
  error: null,
}));

const start = async () => {
  try {
    initCronJobs();
    await fastify.listen({ port: 8080, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Tests import the app and drive it via fastify.inject() — no port, no cron.
if (process.env.BLOOMLY_NO_LISTEN !== '1') start();

export default fastify;
