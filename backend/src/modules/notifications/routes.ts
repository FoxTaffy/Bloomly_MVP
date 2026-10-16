import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  getNotificationsHandler, getUnreadCountHandler,
  markReadHandler, deleteAllHandler, sseNotificationsHandler,
} from './controller.js';

export async function notificationsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  fastify.get<RouteGenericOf<typeof getNotificationsHandler>>('/',        auth, getNotificationsHandler);
  fastify.get<RouteGenericOf<typeof getUnreadCountHandler>>('/count',   auth, getUnreadCountHandler);
  fastify.post<RouteGenericOf<typeof markReadHandler>>('/read',   auth, markReadHandler);
  fastify.delete<RouteGenericOf<typeof deleteAllHandler>>('/',     auth, deleteAllHandler);

  // SSE endpoint: EventSource can't send headers, so we verify token from query param
  fastify.get('/stream', async (req: FastifyRequest<{ Querystring: { token?: string } }>, reply: FastifyReply) => {
    try {
      const tokenStr = (req.headers.authorization?.replace('Bearer ', '') ?? '') || (req.query.token ?? '');
      if (!tokenStr) { reply.code(401).send({ error: 'Unauthorized' }); return; }
      const decoded = fastify.jwt.verify<{ id: string; role: string }>(tokenStr);
      req.user = decoded;
    } catch { reply.code(401).send({ error: 'Unauthorized' }); return; }
    return sseNotificationsHandler(req, reply);
  });
}
