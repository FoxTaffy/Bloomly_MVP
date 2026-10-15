import type { FastifyInstance } from 'fastify';
import { parseDeviceName } from '../auth/device.util.js';
import { isAllowedByPrivacy } from '../../lib/privacy.js';
import prisma from '../../config/prisma.js';
import { presence } from './presence.js';
import { dispatch, detach, send, type WsConnection } from './ws.handlers.js';

const MAX_FRAME_BYTES = 65_536;
const AUTH_TIMEOUT_MS = 30_000;

// WebSocket (/api/) и онлайн-статусы. Регистрируется без префикса: пути абсолютные.
export async function realtimeRoutes(fastify: FastifyInstance) {
  fastify.get('/api/', { websocket: true }, (connection, request) => {
    const conn: WsConnection = {
      socket: connection.socket,
      deviceLabel: parseDeviceName(request.headers['user-agent']),
      userId: null,
      unsubscribe: null,
    };

    // Close unauthenticated connections after 30 seconds
    const authTimeout = setTimeout(() => {
      if (!conn.userId) {
        send(conn, { type: 'error', message: 'Authentication timeout' });
        connection.socket.close();
      }
    }, AUTH_TIMEOUT_MS);

    connection.socket.on('message', async (raw: Buffer) => {
      // Guard against excessively large WebSocket frames (prevent DoS)
      if (raw.length > MAX_FRAME_BYTES) {
        send(conn, { type: 'error', message: 'Message too large' });
        return;
      }
      try {
        await dispatch(fastify, conn, JSON.parse(raw.toString()));
      } catch { /* non-JSON frame — ignore */ }
    });

    connection.socket.on('close', () => {
      clearTimeout(authTimeout);
      detach(conn);
    });
    connection.socket.on('error', () => {});
  });

  // REST endpoint: GET /api/users/online?ids=id1,id2,...
  fastify.get('/api/users/online', { onRequest: [fastify.tryAuthenticate] }, async (request, reply) => {
    const ids = ((request.query as { ids?: string }).ids ?? '').split(',').filter(Boolean);
    const viewerId = (request.user as { id: string } | undefined)?.id;
    const result: Record<string, boolean> = {};
    // Sibling map, not nested under `data[id]` — keeps `data` a plain boolean
    // map so existing `!!data[id]` online checks keep working untouched.
    const deviceData: Record<string, string | null> = {};
    const lastSeenData: Record<string, string | null> = {};
    if (ids.length) {
      const owners = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, online_status_visibility: true, last_seen_at: true },
      });
      const visibilityById = new Map(owners.map((o) => [o.id, o.online_status_visibility]));
      const lastSeenById = new Map(owners.map((o) => [o.id, o.last_seen_at]));
      for (const id of ids) {
        const isOnline = presence.isOnline(id);
        const visible = await isAllowedByPrivacy(visibilityById.get(id), id, viewerId);
        const allowed = isOnline && visible;
        result[id] = allowed;
        deviceData[id] = allowed ? presence.deviceOf(id) : null;
        lastSeenData[id] = (!isOnline && visible) ? (lastSeenById.get(id)?.toISOString() ?? null) : null;
      }
    }
    return reply.send({ success: true, data: result, deviceData, lastSeenData, error: null });
  });
}
