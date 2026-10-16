import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  createTicketHandler, getMyTicketsHandler, getMyTicketHandler, addTicketMessageHandler,
  adminGetTicketsHandler, adminReplyTicketHandler, getAttachmentHandler,
} from './controller.js';

export async function supportRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // User endpoints
  fastify.post<RouteGenericOf<typeof createTicketHandler>>('/tickets', { ...auth, config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } } as RouteShorthandOptions, createTicketHandler);
  fastify.get<RouteGenericOf<typeof getMyTicketsHandler>>('/tickets',      auth, getMyTicketsHandler);
  fastify.get<RouteGenericOf<typeof getMyTicketHandler>>('/tickets/:id',  auth, getMyTicketHandler);
  fastify.post<RouteGenericOf<typeof addTicketMessageHandler>>('/tickets/:id/messages', { ...auth, config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } } as RouteShorthandOptions, addTicketMessageHandler);

  // Админка и «Помощь» грузят вложения пачкой: общий лимит давал 429 и ломал загрузку списка тикетов
  fastify.get<RouteGenericOf<typeof getAttachmentHandler>>('/attachment', { ...auth, config: { rateLimit: false } } as RouteShorthandOptions, getAttachmentHandler);

  // Admin endpoints
  fastify.get<RouteGenericOf<typeof adminGetTicketsHandler>>('/admin/tickets',       auth, adminGetTicketsHandler);
  fastify.patch<RouteGenericOf<typeof adminReplyTicketHandler>>('/admin/tickets/:id', auth, adminReplyTicketHandler);
}
