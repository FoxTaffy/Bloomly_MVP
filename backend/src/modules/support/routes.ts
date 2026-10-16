import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  createTicketHandler, getMyTicketsHandler, getMyTicketHandler, addTicketMessageHandler,
  adminGetTicketsHandler, adminReplyTicketHandler, getAttachmentHandler,
} from './controller.js';

export async function supportRoutes(fastify: FastifyInstance) {
  // Своя копия массива хуков на каждый маршрут: плагин лимитов дописывает хуки прямо в routeOptions.onRequest,
  // и общий массив накапливал лимит создания тикета (5 за 10 мин) на всех маршрутах модуля.
  const authFor = (): RouteShorthandOptions => ({ onRequest: [fastify.authenticate] });

  // User endpoints
  fastify.post<RouteGenericOf<typeof createTicketHandler>>('/tickets', { ...authFor(), config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } } as RouteShorthandOptions, createTicketHandler);
  fastify.get<RouteGenericOf<typeof getMyTicketsHandler>>('/tickets',      authFor(), getMyTicketsHandler);
  fastify.get<RouteGenericOf<typeof getMyTicketHandler>>('/tickets/:id',  authFor(), getMyTicketHandler);
  fastify.post<RouteGenericOf<typeof addTicketMessageHandler>>('/tickets/:id/messages', { ...authFor(), config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } } as RouteShorthandOptions, addTicketMessageHandler);

  // Админка и «Помощь» грузят вложения пачкой: общий лимит давал 429 и ломал загрузку списка тикетов
  fastify.get<RouteGenericOf<typeof getAttachmentHandler>>('/attachment', { ...authFor(), config: { rateLimit: false } } as RouteShorthandOptions, getAttachmentHandler);

  // Admin endpoints
  fastify.get<RouteGenericOf<typeof adminGetTicketsHandler>>('/admin/tickets',       authFor(), adminGetTicketsHandler);
  fastify.patch<RouteGenericOf<typeof adminReplyTicketHandler>>('/admin/tickets/:id', authFor(), adminReplyTicketHandler);
}
