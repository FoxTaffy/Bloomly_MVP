import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  createTicketHandler, getMyTicketsHandler, getMyTicketHandler,
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

  // Admin endpoints
  fastify.get('/admin/tickets',       auth, adminGetTicketsHandler as any);
  fastify.patch('/admin/tickets/:id', auth, adminReplyTicketHandler as any);
}
