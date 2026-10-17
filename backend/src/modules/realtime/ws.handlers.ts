import type { FastifyInstance } from 'fastify';
import prisma from '../../config/prisma.js';
import { resolveAccountIdentity } from '../../lib/accountAccess.js';
import { messageService, messageSubscriptions } from '../messages/service.js';
import { groupService } from '../groups/service.js';
import { moderateGroupMessage } from '../automod/service.js';
import { presence } from './presence.js';
import { logError } from '../../lib/logger.js';

// Состояние одного WebSocket-соединения, общее для всех обработчиков.
export interface WsConnection {
  socket: { send(data: string): void; close(): void; readyState: number; bufferedAmount?: number };
  deviceLabel: string;
  userId: string | null;
  unsubscribe: (() => void) | null;
  expiresAt?: number;
  authGeneration?: number;
  expiryTimer?: ReturnType<typeof setTimeout>;
}

type WsMessage = Record<string, unknown> & { type: string };
type WsHandler = (fastify: FastifyInstance, conn: WsConnection, msg: WsMessage) => Promise<void>;

export function send(conn: WsConnection, payload: unknown) {
  if ((conn.socket.bufferedAmount ?? 0) > 1024 * 1024) { detach(conn); conn.socket.close(); return; }
  if (conn.socket.readyState === 1) conn.socket.send(JSON.stringify(payload));
}

// Сокет живёт дольше HTTP-запроса: без повторной проверки заморозка/бан не отключали бы уже
// открытое соединение, и пользователь мог бы продолжать писать в чат.
export async function isAccountActive(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { deleted_at: true, frozen_at: true, is_banned: true } });
  return !!u && !u.deleted_at && !u.frozen_at && !u.is_banned;
}

/** Снимает соединение с онлайна и отписывает от доставки сообщений. */
export function detach(conn: WsConnection) {
  if (conn.userId) presence.markOffline(conn.userId, conn.socket);
  if (conn.unsubscribe) { conn.unsubscribe(); conn.unsubscribe = null; }
  clearTimeout(conn.expiryTimer);
  conn.expiryTimer = undefined;
  conn.expiresAt = undefined;
  conn.authGeneration = (conn.authGeneration ?? 0) + 1;
  conn.userId = null;
}

const ping: WsHandler = async (_fastify, conn) => {
  send(conn, { type: 'pong' });
};

const auth: WsHandler = async (fastify, conn, msg) => {
  if (typeof msg.token !== 'string' || !msg.token) return;
  try {
    const payload = fastify.jwt.verify<{ id: string; exp?: number }>(msg.token);
    await resolveAccountIdentity(payload.id);
    if (conn.socket.readyState !== 1) return;
    // Re-authentication always releases the previous listener, including the same account.
    detach(conn);
    conn.userId = payload.id;
    conn.expiresAt = payload.exp ? payload.exp * 1000 : undefined;
    const generation = conn.authGeneration;
    presence.markOnline(conn.userId, conn.socket, conn.deviceLabel);

    // Subscribe to incoming messages for this user
    let pending = 0;
    let delivery = Promise.resolve();
    conn.unsubscribe = messageSubscriptions.subscribe(conn.userId, data => {
      if (++pending > 100) { detach(conn); conn.socket.close(); return; }
      delivery = delivery.then(async () => {
        await resolveAccountIdentity(payload.id);
        if (conn.authGeneration !== generation || conn.userId !== payload.id) return;
        if (conn.expiresAt && Date.now() >= conn.expiresAt) { detach(conn); conn.socket.close(); return; }
        if ((conn.socket.bufferedAmount ?? 0) > 1024 * 1024) { detach(conn); conn.socket.close(); return; }
        if (conn.socket.readyState === 1) conn.socket.send(data);
      }).catch(() => {
        if (conn.authGeneration === generation) { detach(conn); conn.socket.close(); }
      }).finally(() => { pending--; });
    });
    if (conn.expiresAt) conn.expiryTimer = setTimeout(() => { detach(conn); conn.socket.close(); }, Math.max(0, conn.expiresAt - Date.now()));

    send(conn, { type: 'auth_ok' });
  } catch {
    send(conn, { type: 'auth_err' });
    detach(conn);
    conn.socket.close();
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
    moderateGroupMessage(userId).catch(logError('[AUTOMOD] moderateGroupMessage error'));
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
  if (conn.userId && type !== 'auth') {
    if ((conn.expiresAt && Date.now() >= conn.expiresAt) || !(await isAccountActive(conn.userId))) {
      detach(conn);
      conn.socket.close();
      return;
    }
  }
  await entry.handler(fastify, conn, msg as WsMessage);
}
