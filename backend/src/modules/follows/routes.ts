import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  toggleFollowHandler, checkFollowingHandler, checkBulkHandler,
  getFollowersHandler, getFollowingHandler, getFollowCountsHandler,
  getSubscriptionFeedHandler, getFriendsHandler, getRelationStatusHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    tryAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function followsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  const tryAuth: RouteShorthandOptions = { onRequest: [fastify.tryAuthenticate] };
  fastify.post('/:id/toggle',    auth, toggleFollowHandler as any);
  fastify.get('/:id/check',      auth, checkFollowingHandler as any);
  fastify.get('/check-bulk',     auth, checkBulkHandler as any);
  fastify.get('/:id/followers',  tryAuth, getFollowersHandler as any);
  fastify.get('/:id/following',  tryAuth, getFollowingHandler as any);
  fastify.get('/:id/counts',     getFollowCountsHandler as any);
  fastify.get('/:id/friends',    tryAuth, getFriendsHandler as any);
  fastify.get('/:id/relation',   auth, getRelationStatusHandler as any);
  fastify.get('/feed',           auth, getSubscriptionFeedHandler as any);
}
