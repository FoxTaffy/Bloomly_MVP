import type { FastifyInstance } from 'fastify';
import prisma from '../../config/prisma.js';
import { messageService, messageSubscriptions } from '../messages/service.js';
import { groupService } from '../groups/service.js';
import { moderateGroupMessage } from '../automod/service.js';
import { presence } from './presence.js';

// Состояние одного WebSocket-соединения, общее для всех обработчиков.
export interface WsConnection {
  socket: { send(data: string): void; close(): void; readyState: number };
  deviceLabel: string;
  userId: string | null;
  unsubscribe: (() => void) | null;
}

type WsMessage = Record<string, unknown> & { type: string };
type WsHandler = (fastify: FastifyInstance, conn: WsConnection, msg: WsMessage) => Promise<void>;

export function send(conn: WsConnection, payload: unknown) {
  conn.socket.send(JSON.stringify(payload));
}

// Сокет живёт дольше HTTP-запроса: без повторной проверки заморозка/бан не отключали бы уже
// открытое соединение, и пользователь мог бы продолжать писать в чат.
export async function isAccountActive(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { deleted_at: true, frozen_at: true } });
  return !!u && !u.deleted_at && !u.frozen_at;
}

/** Снимает соединение с онлайна и отписывает от доставки сообщений. */
export function detach(conn: WsConnection) {
  if (conn.userId) presence.markOffline(conn.userId, conn.socket);
  if (conn.unsubscribe) { conn.unsubscribe(); conn.unsubscribe = null; }
}

const ping: WsHandler = async (_fastify, conn) => {
  send(conn, { type: 'pong' });
};

const auth: WsHandler = async (fastify, conn, msg) => {
  if (!msg.token) return;
  try {
    const payload = fastify.jwt.verify(msg.token as string) as { id: string };
    if (!(await isAccountActive(payload.id))) {
      send(conn, { type: 'auth_err' });
      conn.socket.close();
      return;
    }
    // If re-authing with a different ID (shouldn't happen), clean up old
    if (conn.userId && conn.userId !== payload.id) detach(conn);
    conn.userId = payload.id;
    presence.markOnline(conn.userId, conn.socket, conn.deviceLabel);

    // Subscribe to incoming messages for this user
    conn.unsubscribe = messageSubscriptions.subscribe(conn.userId, (data) => {
      if (conn.socket.readyState === 1 /* OPEN */) conn.socket.send(data);
    });

    send(conn, { type: 'auth_ok' });
  } catch {
    send(conn, { type: 'auth_err' });
  }
};

// ── Typing indicator ──────────────────────────────────────────────────────────
const typing: WsHandler = async (_fastify, conn, msg) => {
  const userId = conn.userId!;
  const conversationId = msg.conversationId as string | undefined;
  if (!conversationId) return;
  try {
    const others = await messageService.getOtherParticipantIds(conversationId, userId);
    for (const uid of others) {
      messageSubscriptions.push(uid, { type: 'typing', conversationId, userId });
    }
  } catch { /* not a participant or conv not found */ }
};

// ── Client sends a chat message over WebSocket ────────────────────────────────
const message: WsHandler = async (_fastify, conn, msg) => {
  const userId = conn.userId!;
  const { conversationId, content, file_url, media_type, reply_to_id } = msg;
  if (!conversationId || (!content && !file_url)) return;
  if (!(await isAccountActive(userId))) { conn.socket.close(); return; }
  try {
    await messageService.sendMessage({
      conversationId: conversationId as string,
      senderId: userId,
      content: (content as string) ?? '',
      file_url: (file_url as string | undefined) ?? null,
      media_type: (media_type as string | undefined) ?? undefined,
      reply_to_id: (reply_to_id as string | undefined) ?? null,
    });
  } catch (e) {
    send(conn, { type: 'error', message: (e as Error).message });
  }
};

// ── Client sends a group chat message ─────────────────────────────────────────
const groupMessageSend: WsHandler = async (_fastify, conn, msg) => {
  const userId = conn.userId!;
  const groupId = msg.groupId as string | undefined;
  const content = msg.content as string | undefined;
  if (!groupId || !content) return;
  if (!(await isAccountActive(userId))) { conn.socket.close(); return; }
  try {
    await groupService.assertGroupMember(groupId, userId);
    const saved = await groupService.sendGroupMessage(groupId, userId, content.trim());
    // fire-and-forget automod check, как в REST (sendGroupMessageHandler)
    moderateGroupMessage(userId).catch((err) => console.error('[AUTOMOD] moderateGroupMessage error:', err));
    const members = await prisma.groupMember.findMany({ where: { group_id: groupId }, select: { user_id: true } });
    for (const m of members) {
      messageSubscriptions.push(m.user_id, { type: 'group_message', groupId, message: saved });
    }
  } catch (e) {
    send(conn, { type: 'error', message: (e as Error).message });
  }
};

// type сообщения → обработчик. requiresAuth: до успешного 'auth' сообщение молча игнорируется.
const handlers: Record<string, { handler: WsHandler; requiresAuth: boolean }> = {
  ping:               { handler: ping,             requiresAuth: false },
  auth:               { handler: auth,             requiresAuth: false },
  typing:             { handler: typing,           requiresAuth: true },
  message:            { handler: message,          requiresAuth: true },
  group_message_send: { handler: groupMessageSend, requiresAuth: true },
};

export async function dispatch(fastify: FastifyInstance, conn: WsConnection, msg: unknown) {
  if (!msg || typeof msg !== 'object') return;
  const type = (msg as { type?: unknown }).type;
  if (typeof type !== 'string' || !Object.hasOwn(handlers, type)) return;
  const entry = handlers[type];
  if (entry.requiresAuth && !conn.userId) return;
  await entry.handler(fastify, conn, msg as WsMessage);
}
