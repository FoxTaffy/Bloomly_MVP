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
import { relationshipsRoutes } from './modules/relationships/routes.js';
import { messagesRoutes } from './modules/messages/routes.js';
import { friendsRoutes } from './modules/friends/routes.js';
import { groupsRoutes } from './modules/groups/routes.js';
import { verificationRoutes } from './modules/verification/routes.js';
import { messageService, messageSubscriptions } from './modules/messages/service.js';
import { initCronJobs } from './cron.js';

dotenv.config();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('[FATAL] JWT_SECRET env variable is not set. Refusing to start in production.');
    process.exit(1);
  }
  console.warn('[WARN] JWT_SECRET is not set. Using insecure fallback for development only.');
}

const fastify = Fastify({ logger: true, bodyLimit: 26_214_400 }); // 25 MB

// Allow specific origins in production; fall back to wildcard for development only
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : true // dev fallback
fastify.register(cors, { origin: allowedOrigins, credentials: true });
fastify.register(jwt, { secret: jwtSecret || 'bloomly_secret_dev_only' });
fastify.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
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
fastify.register(relationshipsRoutes, { prefix: '/api/relationships' });
fastify.register(messagesRoutes, { prefix: '/api/messages' });
fastify.register(friendsRoutes, { prefix: '/api/friends' });
fastify.register(groupsRoutes, { prefix: '/api/groups' });
fastify.register(verificationRoutes, { prefix: '/api/verification' });

// ── In-memory online status tracking ─────────────────────────────────────
// Use a Set per user so multiple browser tabs / pages work correctly
const onlineUsers = new Map<string, Set<any>>()
;(fastify as any).onlineUsers = onlineUsers

// Remove entirely if set becomes empty
function markOffline(userId: string, socket: any) {
  const sockets = onlineUsers.get(userId)
  if (!sockets) return
  sockets.delete(socket)
  if (sockets.size === 0) onlineUsers.delete(userId)
}

fastify.register(async function (fastify) {
  fastify.get('/api/', { websocket: true }, (connection) => {
    let authedUserId: string | null = null

    // Track message subscription cleanup function
    let unsubscribeMessages: (() => void) | null = null

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
            if (!onlineUsers.has(authedUserId)) onlineUsers.set(authedUserId, new Set())
            onlineUsers.get(authedUserId)!.add(connection.socket)

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
      } catch { /* non-JSON frame — ignore */ }
    })

    connection.socket.on('close', () => {
      if (authedUserId) markOffline(authedUserId, connection.socket)
      if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null }
    })
    connection.socket.on('error', () => {})
  })

  // REST endpoint: GET /api/users/online?ids=id1,id2,...
  fastify.get('/api/users/online', async (request, reply) => {
    const ids = ((request.query as any).ids ?? '').split(',').filter(Boolean) as string[]
    const result: Record<string, boolean> = {}
    for (const id of ids) result[id] = onlineUsers.has(id)
    return reply.send({ success: true, data: result, error: null })
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

start();
