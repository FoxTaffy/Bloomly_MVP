import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import * as dotenv from 'dotenv';
import { authRoutes } from './modules/auth/routes.js';
import { parseDeviceName } from './modules/auth/device.util.js';
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
import { messageService, messageSubscriptions } from './modules/messages/service.js';
import { groupService } from './modules/groups/service.js';
import { initCronJobs } from './cron.js';
import prisma from './config/prisma.js';
import { isAllowedByPrivacy } from './lib/privacy.js';
import { getSetting } from './lib/settings.js';
import { isAdult } from './lib/age.js';
import { isModerator } from './lib/roles.js';

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET env variable is not set. Refusing to start in production.');
    process.exit(1);
  }
  console.warn('[WARN] JWT_SECRET is not set. Using insecure fallback for development only.');
}

const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] COOKIE_SECRET env variable is not set. Refusing to start in production.');
    process.exit(1);
  }
  console.warn('[WARN] COOKIE_SECRET is not set. Using insecure fallback for development only.');
}

if (!process.env.ALLOWED_ORIGINS && process.env.NODE_ENV === 'production') {
  console.error('[FATAL] ALLOWED_ORIGINS env variable is not set. Refusing to start in production.');
  process.exit(1);
}

// 4300 MB ceiling — covers the largest chat-attachment tier (4 GB) with headroom for
// multipart overhead. Per-tier caps (2 GB free / 4 GB lite+) are enforced in the upload
// handler itself; this is just the outer limit fastify/busboy will allow through at all.
// NOTE: if a reverse proxy (nginx, etc.) sits in front of this API, its own body-size
// limit (e.g. client_max_body_size) must be raised to match, or it will 413 first.
const MAX_UPLOAD_BYTES = 4_300 * 1024 * 1024;

const fastify = Fastify({ logger: process.env.NODE_ENV !== 'test', bodyLimit: MAX_UPLOAD_BYTES, trustProxy: true });

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
  if (process.env.NODE_ENV === 'production') {
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
      (request.user as any).role = dbUser.role;
      (request.user as any).is_adult = isAdult(dbUser.birth_date);
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
        (request as any).user = undefined;
      } else {
        (request.user as any).role = dbUser.role;
        (request.user as any).is_adult = isAdult(dbUser.birth_date);
      }
    } catch {
      (request as any).user = undefined;
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

// ── In-memory online status tracking ─────────────────────────────────────
// Map per user of socket → device label ("Chrome · iPhone"), so multiple
// browser tabs / devices work correctly and the UI can show what someone's on.
const onlineUsers = new Map<string, Map<any, string>>()
;(fastify as any).onlineUsers = onlineUsers

// Remove entirely if map becomes empty
function markOffline(userId: string, socket: any) {
  const sockets = onlineUsers.get(userId)
  if (!sockets) return
  sockets.delete(socket)
  if (sockets.size === 0) {
    onlineUsers.delete(userId)
    // Persist so "last seen" survives page reloads / server restarts, not just this session's memory
    prisma.user.update({ where: { id: userId }, data: { last_seen_at: new Date() } }).catch(() => {})
  }
}

fastify.register(async function (fastify) {
  fastify.get('/api/', { websocket: true }, (connection, request) => {
    let authedUserId: string | null = null
    const deviceLabel = parseDeviceName(request.headers['user-agent'])

    // Track message subscription cleanup function
    let unsubscribeMessages: (() => void) | null = null

    // Close unauthenticated connections after 30 seconds
    const authTimeout = setTimeout(() => {
      if (!authedUserId) {
        connection.socket.send(JSON.stringify({ type: 'error', message: 'Authentication timeout' }))
        connection.socket.close()
      }
    }, 30_000)

    connection.socket.on('message', async (raw: Buffer) => {
      try {
        // Guard against excessively large WebSocket frames (prevent DoS)
        if (raw.length > 65_536) {
          connection.socket.send(JSON.stringify({ type: 'error', message: 'Message too large' }))
          return
        }

        const msg = JSON.parse(raw.toString())

        if (msg?.type === 'ping') {
          connection.socket.send(JSON.stringify({ type: 'pong' }))
          return
        }

        if (msg?.type === 'auth' && msg?.token) {
          try {
            const payload = fastify.jwt.verify(msg.token) as { id: string }
            // If re-authing with a different ID (shouldn't happen), clean up old
            if (authedUserId && authedUserId !== payload.id) {
              markOffline(authedUserId, connection.socket)
              if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null }
            }
            authedUserId = payload.id
            if (!onlineUsers.has(authedUserId)) onlineUsers.set(authedUserId, new Map())
            onlineUsers.get(authedUserId)!.set(connection.socket, deviceLabel)

            // Subscribe to incoming messages for this user
            unsubscribeMessages = messageSubscriptions.subscribe(authedUserId, (payload) => {
              if (connection.socket.readyState === 1 /* OPEN */) {
                connection.socket.send(payload)
              }
            })

            connection.socket.send(JSON.stringify({ type: 'auth_ok' }))
          } catch {
            connection.socket.send(JSON.stringify({ type: 'auth_err' }))
          }
          return
        }

        // ── Typing indicator ──────────────────────────────────────────────
        if (msg?.type === 'typing' && authedUserId) {
          const { conversationId } = msg
          if (!conversationId) return
          try {
            const others = await messageService.getOtherParticipantIds(conversationId as string, authedUserId)
            for (const uid of others) {
              messageSubscriptions.push(uid, { type: 'typing', conversationId, userId: authedUserId })
            }
          } catch { /* not a participant or conv not found */ }
          return
        }

        // ── Client sends a chat message over WebSocket ────────────────────
        if (msg?.type === 'message' && authedUserId) {
          const { conversationId, content, file_url, media_type, reply_to_id } = msg
          if (!conversationId || (!content && !file_url)) return
          try {
            await messageService.sendMessage({
              conversationId: conversationId as string,
              senderId: authedUserId,
              content: (content as string) ?? '',
              file_url: (file_url as string | undefined) ?? null,
              media_type: (media_type as string | undefined) ?? undefined,
              reply_to_id: (reply_to_id as string | undefined) ?? null,
            })
          } catch (e) {
            connection.socket.send(JSON.stringify({ type: 'error', message: (e as Error).message }))
          }
          return
        }

        // ── Client sends a group chat message ──────────────────────────────────
        if (msg?.type === 'group_message_send' && authedUserId) {
          const { groupId, content } = msg;
          if (!groupId || !content) return;
          try {
            const saved = await groupService.sendGroupMessage(groupId as string, authedUserId, (content as string).trim());
            const members = await prisma.groupMember.findMany({ where: { group_id: groupId as string }, select: { user_id: true } });
            for (const m of members) {
              messageSubscriptions.push(m.user_id, { type: 'group_message', groupId, message: saved });
            }
          } catch (e) {
            connection.socket.send(JSON.stringify({ type: 'error', message: (e as Error).message }));
          }
          return;
        }
      } catch { /* non-JSON frame — ignore */ }
    })

    connection.socket.on('close', () => {
      clearTimeout(authTimeout)
      if (authedUserId) markOffline(authedUserId, connection.socket)
      if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null }
    })
    connection.socket.on('error', () => {})
  })

  // REST endpoint: GET /api/users/online?ids=id1,id2,...
  fastify.get('/api/users/online', { onRequest: [fastify.tryAuthenticate] }, async (request, reply) => {
    const ids = ((request.query as any).ids ?? '').split(',').filter(Boolean) as string[]
    const viewerId = (request.user as { id: string } | undefined)?.id
    const result: Record<string, boolean> = {}
    // Sibling map, not nested under `data[id]` — keeps `data` a plain boolean
    // map so existing `!!data[id]` online checks keep working untouched.
    const deviceData: Record<string, string | null> = {}
    const lastSeenData: Record<string, string | null> = {}
    if (ids.length) {
      const owners = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, online_status_visibility: true, last_seen_at: true },
      })
      const visibilityById = new Map(owners.map((o) => [o.id, o.online_status_visibility]))
      const lastSeenById = new Map(owners.map((o) => [o.id, o.last_seen_at]))
      for (const id of ids) {
        const sockets = onlineUsers.get(id)
        const isOnline = !!sockets && sockets.size > 0
        const visible = await isAllowedByPrivacy(visibilityById.get(id), id, viewerId)
        const allowed = isOnline && visible
        result[id] = allowed
        deviceData[id] = allowed ? ([...sockets!.values()][0] ?? null) : null
        lastSeenData[id] = (!isOnline && visible) ? (lastSeenById.get(id)?.toISOString() ?? null) : null
      }
    }
    return reply.send({ success: true, data: result, deviceData, lastSeenData, error: null })
  })
})

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
