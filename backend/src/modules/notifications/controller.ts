import { FastifyReply, FastifyRequest } from 'fastify';
import { notificationService } from './service.js';

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
  const { id: userId } = req.user as JwtUser;
  reply.raw.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  reply.raw.write('data: connected\n\n');

  const unsubscribe = notificationService.subscribe(userId, (data) => {
    reply.raw.write(`data: ${data}\n\n`);
  });

  // Heartbeat every 25s
  const heartbeat = setInterval(() => {
    reply.raw.write(': ping\n\n');
  }, 25_000);

  req.socket.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
};
