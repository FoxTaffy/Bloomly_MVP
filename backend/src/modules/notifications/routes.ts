import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  getNotificationsHandler, getUnreadCountHandler,
  markReadHandler, deleteAllHandler, sseNotificationsHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function notificationsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  fastify.get('/',        auth, getNotificationsHandler as any);
  fastify.get('/count',   auth, getUnreadCountHandler as any);
  fastify.post('/read',   auth, markReadHandler as any);
  fastify.delete('/',     auth, deleteAllHandler as any);

  // SSE endpoint: EventSource can't send headers, so we verify token from query param
  fastify.get('/stream', async (req: FastifyRequest<{ Querystring: { token?: string } }>, reply: FastifyReply) => {
    try {
      const tokenStr = (req.headers.authorization?.replace('Bearer ', '') ?? '') || (req.query.token ?? '');
      if (!tokenStr) { reply.code(401).send({ error: 'Unauthorized' }); return; }
      const decoded = fastify.jwt.verify<{ id: string; role: string }>(tokenStr);
      (req as any).user = decoded;
    } catch { reply.code(401).send({ error: 'Unauthorized' }); return; }
    return sseNotificationsHandler(req, reply);
  });
}
