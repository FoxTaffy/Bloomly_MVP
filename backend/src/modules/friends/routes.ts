import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  sendRequestHandler,
  acceptRequestHandler,
  rejectRequestHandler,
  cancelRequestHandler,
  removeFriendHandler,
  getIncomingRequestsHandler,
  getOutgoingRequestsHandler,
  getFriendsHandler,
  getFriendStatusesHandler,
  getFollowersHandler,
  getFollowingHandler,
  getBirthdaysHandler,
  getNearbyBirthdaysHandler,
  getSuggestionsHandler,
  getFriendStatusHandler,
} from './controller.js';

export async function friendsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // GET /api/friends — взаимные подписки (?filter=online)
  fastify.get<RouteGenericOf<typeof getFriendsHandler>>('/', auth, getFriendsHandler);

  // GET /api/friends/statuses — друзья с историями и статусами (полоска в «Интересном»)
  fastify.get<RouteGenericOf<typeof getFriendStatusesHandler>>('/statuses', auth, getFriendStatusesHandler);

  // GET /api/friends/followers — подписчики
  fastify.get<RouteGenericOf<typeof getFollowersHandler>>('/followers', auth, getFollowersHandler);

  // GET /api/friends/following — подписки
  fastify.get<RouteGenericOf<typeof getFollowingHandler>>('/following', auth, getFollowingHandler);

  // GET /api/friends/requests — входящие заявки
  fastify.get<RouteGenericOf<typeof getIncomingRequestsHandler>>('/requests', auth, getIncomingRequestsHandler);

  // GET /api/friends/requests/outgoing — исходящие заявки
  fastify.get<RouteGenericOf<typeof getOutgoingRequestsHandler>>('/requests/outgoing', auth, getOutgoingRequestsHandler);

  // GET /api/friends/birthdays — дни рождения друзей
  fastify.get<RouteGenericOf<typeof getBirthdaysHandler>>('/birthdays', auth, getBirthdaysHandler);

  // GET /api/friends/birthdays/nearby — др вчера/сегодня/завтра (для баннера над диалогами)
  fastify.get<RouteGenericOf<typeof getNearbyBirthdaysHandler>>('/birthdays/nearby', auth, getNearbyBirthdaysHandler);

  // GET /api/friends/suggestions — рекомендации
  fastify.get<RouteGenericOf<typeof getSuggestionsHandler>>('/suggestions', auth, getSuggestionsHandler);

  // GET /api/friends/:id/status — статус дружбы
  fastify.get<RouteGenericOf<typeof getFriendStatusHandler>>('/:id/status', auth, getFriendStatusHandler);

  // POST /api/friends/request — отправить заявку { targetId }
  fastify.post<RouteGenericOf<typeof sendRequestHandler>>('/request', auth, sendRequestHandler);

  // POST /api/friends/requests/:id/accept
  fastify.post<RouteGenericOf<typeof acceptRequestHandler>>('/requests/:id/accept', auth, acceptRequestHandler);

  // POST /api/friends/requests/:id/reject
  fastify.post<RouteGenericOf<typeof rejectRequestHandler>>('/requests/:id/reject', auth, rejectRequestHandler);

  // DELETE /api/friends/requests/:id — отменить свою заявку
  fastify.delete<RouteGenericOf<typeof cancelRequestHandler>>('/requests/:id', auth, cancelRequestHandler);

  // DELETE /api/friends/:id — удалить из друзей
  fastify.delete<RouteGenericOf<typeof removeFriendHandler>>('/:id', auth, removeFriendHandler);
}
