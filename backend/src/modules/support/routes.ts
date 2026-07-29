import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  createTicketHandler, getMyTicketsHandler, getMyTicketHandler, addTicketMessageHandler,
  adminGetTicketsHandler, adminReplyTicketHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function supportRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // User endpoints
  fastify.post('/tickets', { ...auth, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } } as RouteShorthandOptions, createTicketHandler as any);
  fastify.get('/tickets',      auth, getMyTicketsHandler as any);
  fastify.get('/tickets/:id',  auth, getMyTicketHandler as any);
  fastify.post('/tickets/:id/messages', { ...auth, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } } as RouteShorthandOptions, addTicketMessageHandler as any);

  // Admin endpoints
  fastify.get('/admin/tickets',       auth, adminGetTicketsHandler as any);
  fastify.patch('/admin/tickets/:id', auth, adminReplyTicketHandler as any);
}
