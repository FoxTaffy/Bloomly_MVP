import { FastifyReply, FastifyRequest } from 'fastify';
import { notificationService } from './service.js';
import { resolveAccountIdentity } from '../../lib/accountAccess.js';

interface JwtUser { id: string; role: string }

export const getNotificationsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const { id: userId } = req.user as JwtUser;
  const notifications = await notificationService.getForUser(userId);
  return reply.send({ success: true, data: { notifications }, error: null });
};

export const getUnreadCountHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const { id: userId } = req.user as JwtUser;
  const count = await notificationService.unreadCount(userId);
  return reply.send({ success: true, data: { count }, error: null });
};

export const markReadHandler = async (
  req: FastifyRequest<{ Body: { ids?: string[] } }>,
  reply: FastifyReply,
) => {
  const { id: userId } = req.user as JwtUser;
  await notificationService.markRead(userId, req.body?.ids);
  return reply.send({ success: true, data: { ok: true }, error: null });
};

export const deleteAllHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  const { id: userId } = req.user as JwtUser;
  await notificationService.deleteAll(userId);
  return reply.send({ success: true, data: { ok: true }, error: null });
};

export const sseNotificationsHandler = async (
  req: FastifyRequest,
  reply: FastifyReply,
) => {
  const { id: userId, exp } = req.user as JwtUser & { exp?: number };
  reply.hijack();
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) reply.raw.setHeader(name, Array.isArray(value) ? value.map(String) : value);
  }
  reply.raw.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write('data: connected\n\n');

  let closed = false;
  let delivery = Promise.resolve();
  let queued = 0;
  let heartbeat: ReturnType<typeof setInterval>;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(expiry);
    unsubscribe();
    if (!reply.raw.writableEnded) reply.raw.end();
  };
  const ensureActive = async () => {
    if (closed || (exp && Date.now() >= exp * 1000)) throw new Error('Stream expired');
    await resolveAccountIdentity(userId);
    if (closed || reply.raw.destroyed) throw new Error('Stream closed');
  };
  const unsubscribe = notificationService.subscribe(userId, data => {
    if (closed) return;
    if (++queued > 100) { close(); return; }
    delivery = delivery.then(async () => {
      await ensureActive();
      if (!reply.raw.write(`data: ${data}\n\n`) && reply.raw.writableLength > 1024 * 1024) close();
    }).catch(close).finally(() => { queued--; });
  });
  heartbeat = setInterval(() => {
    void ensureActive().then(() => { if (!closed) reply.raw.write(': ping\n\n'); }).catch(close);
  }, 25_000);
  if (exp) expiry = setTimeout(close, Math.max(0, exp * 1000 - Date.now()));
  reply.raw.once('close', close);
  reply.raw.once('error', close);
  req.raw.once('aborted', close);
};
