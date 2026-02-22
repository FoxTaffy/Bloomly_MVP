import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getNotificationsHandler,
  markReadHandler,
  markAllReadHandler,
  getUnreadCountHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.get('/', { onRequest: [fastify.authenticate] }, getNotificationsHandler);
  fastify.get('/unread-count', { onRequest: [fastify.authenticate] }, getUnreadCountHandler);
  fastify.post('/:id/read', { onRequest: [fastify.authenticate] }, markReadHandler);
  fastify.post('/read-all', { onRequest: [fastify.authenticate] }, markAllReadHandler);
}
