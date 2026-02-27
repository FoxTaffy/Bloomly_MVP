import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  toggleFollowHandler, checkFollowingHandler, checkBulkHandler,
  getFollowersHandler, getFollowingHandler, getFollowCountsHandler,
  getSubscriptionFeedHandler, getFriendsHandler, getRelationStatusHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function followsRoutes(fastify: FastifyInstance) {
  fastify.post('/:id/toggle',    { onRequest: [fastify.authenticate] }, toggleFollowHandler);
  fastify.get('/:id/check',      { onRequest: [fastify.authenticate] }, checkFollowingHandler);
  fastify.get('/check-bulk',     { onRequest: [fastify.authenticate] }, checkBulkHandler);
  fastify.get('/:id/followers',  getFollowersHandler);
  fastify.get('/:id/following',  getFollowingHandler);
  fastify.get('/:id/counts',     getFollowCountsHandler);
  fastify.get('/:id/friends',    getFriendsHandler);
  fastify.get('/:id/relation',   { onRequest: [fastify.authenticate] }, getRelationStatusHandler);
  fastify.get('/feed',           { onRequest: [fastify.authenticate] }, getSubscriptionFeedHandler);
}
