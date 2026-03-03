import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  sendRequestHandler,
  acceptRequestHandler,
  rejectRequestHandler,
  cancelRequestHandler,
  removeFriendHandler,
  getIncomingRequestsHandler,
  getOutgoingRequestsHandler,
  getFriendsHandler,
  getFollowersHandler,
  getFollowingHandler,
  getBirthdaysHandler,
  getSuggestionsHandler,
  getFriendStatusHandler,
} from './controller.js';

export async function friendsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // GET /api/friends — взаимные подписки (?filter=online)
  fastify.get('/', auth, getFriendsHandler as any);

  // GET /api/friends/followers — подписчики
  fastify.get('/followers', auth, getFollowersHandler as any);

  // GET /api/friends/following — подписки
  fastify.get('/following', auth, getFollowingHandler as any);

  // GET /api/friends/requests — входящие заявки
  fastify.get('/requests', auth, getIncomingRequestsHandler as any);

  // GET /api/friends/requests/outgoing — исходящие заявки
  fastify.get('/requests/outgoing', auth, getOutgoingRequestsHandler as any);

  // GET /api/friends/birthdays — дни рождения друзей
  fastify.get('/birthdays', auth, getBirthdaysHandler as any);

  // GET /api/friends/suggestions — рекомендации
  fastify.get('/suggestions', auth, getSuggestionsHandler as any);

  // GET /api/friends/:id/status — статус дружбы
  fastify.get('/:id/status', auth, getFriendStatusHandler as any);

  // POST /api/friends/request — отправить заявку { targetId }
  fastify.post('/request', auth, sendRequestHandler as any);

  // POST /api/friends/requests/:id/accept
  fastify.post('/requests/:id/accept', auth, acceptRequestHandler as any);

  // POST /api/friends/requests/:id/reject
  fastify.post('/requests/:id/reject', auth, rejectRequestHandler as any);

  // DELETE /api/friends/requests/:id — отменить свою заявку
  fastify.delete('/requests/:id', auth, cancelRequestHandler as any);

  // DELETE /api/friends/:id — удалить из друзей
  fastify.delete('/:id', auth, removeFriendHandler as any);
}
