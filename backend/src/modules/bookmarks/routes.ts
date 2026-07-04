import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  toggleUserBookmarkHandler,
  getBookmarkedUsersHandler,
  getUserBookmarkStatusHandler,
  toggleGroupBookmarkHandler,
  getBookmarkedGroupsHandler,
  getGroupBookmarkStatusHandler,
  getLabelsHandler,
  createLabelHandler,
  deleteLabelHandler,
  assignLabelHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function bookmarksRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // User bookmarks
  fastify.get('/users',                      auth, getBookmarkedUsersHandler      as any);
  fastify.get('/users/:targetId',            auth, getUserBookmarkStatusHandler   as any);
  fastify.post('/users/:targetId',           auth, toggleUserBookmarkHandler      as any);

  // Group bookmarks
  fastify.get('/groups',                     auth, getBookmarkedGroupsHandler     as any);
  fastify.get('/groups/:groupId',            auth, getGroupBookmarkStatusHandler  as any);
  fastify.post('/groups/:groupId',           auth, toggleGroupBookmarkHandler     as any);

  // Post bookmark labels
  fastify.get('/labels',                     auth, getLabelsHandler               as any);
  fastify.post('/labels',                    auth, createLabelHandler             as any);
  fastify.delete('/labels/:labelId',         auth, deleteLabelHandler             as any);
  fastify.post('/posts/:postId/label',       auth, assignLabelHandler             as any);
}
