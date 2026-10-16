import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  toggleFollowHandler, checkFollowingHandler, checkBulkHandler,
  getFollowersHandler, getFollowingHandler, getFollowCountsHandler,
  getSubscriptionFeedHandler, getFriendsHandler, getRelationStatusHandler,
} from './controller.js';

export async function followsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  const tryAuth: RouteShorthandOptions = { onRequest: [fastify.tryAuthenticate] };
  fastify.post<RouteGenericOf<typeof toggleFollowHandler>>('/:id/toggle',    { onRequest: [fastify.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, toggleFollowHandler);
  fastify.get<RouteGenericOf<typeof checkFollowingHandler>>('/:id/check',      auth, checkFollowingHandler);
  fastify.get<RouteGenericOf<typeof checkBulkHandler>>('/check-bulk',     auth, checkBulkHandler);
  fastify.get<RouteGenericOf<typeof getFollowersHandler>>('/:id/followers',  tryAuth, getFollowersHandler);
  fastify.get<RouteGenericOf<typeof getFollowingHandler>>('/:id/following',  tryAuth, getFollowingHandler);
  fastify.get<RouteGenericOf<typeof getFollowCountsHandler>>('/:id/counts',     getFollowCountsHandler);
  fastify.get<RouteGenericOf<typeof getFriendsHandler>>('/:id/friends',    tryAuth, getFriendsHandler);
  fastify.get<RouteGenericOf<typeof getRelationStatusHandler>>('/:id/relation',   auth, getRelationStatusHandler);
  fastify.get<RouteGenericOf<typeof getSubscriptionFeedHandler>>('/feed',           auth, getSubscriptionFeedHandler);
}
