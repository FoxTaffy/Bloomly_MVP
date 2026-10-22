import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  toggleUserBookmarkHandler,
  getBookmarkedUsersHandler,
  getUserBookmarkStatusHandler,
  toggleGroupBookmarkHandler,
  getBookmarkedGroupsHandler,
  getGroupBookmarkStatusHandler,
  toggleListingBookmarkHandler,
  getBookmarkedListingsHandler,
  getLabelsHandler,
  createLabelHandler,
  deleteLabelHandler,
  assignLabelHandler,
} from './controller.js';

export async function bookmarksRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // User bookmarks
  fastify.get<RouteGenericOf<typeof getBookmarkedUsersHandler>>('/users',                      auth, getBookmarkedUsersHandler);
  fastify.get<RouteGenericOf<typeof getUserBookmarkStatusHandler>>('/users/:targetId',            auth, getUserBookmarkStatusHandler);
  fastify.post<RouteGenericOf<typeof toggleUserBookmarkHandler>>('/users/:targetId',           auth, toggleUserBookmarkHandler);

  // Group bookmarks
  fastify.get<RouteGenericOf<typeof getBookmarkedGroupsHandler>>('/groups',                     auth, getBookmarkedGroupsHandler);
  fastify.get<RouteGenericOf<typeof getGroupBookmarkStatusHandler>>('/groups/:groupId',            auth, getGroupBookmarkStatusHandler);
  fastify.post<RouteGenericOf<typeof toggleGroupBookmarkHandler>>('/groups/:groupId',           auth, toggleGroupBookmarkHandler);

  // Dealers' Den listing bookmarks
  fastify.get<RouteGenericOf<typeof getBookmarkedListingsHandler>>('/listings',                 auth, getBookmarkedListingsHandler);
  fastify.post<RouteGenericOf<typeof toggleListingBookmarkHandler>>('/listings/:listingId',        auth, toggleListingBookmarkHandler);

  // Post bookmark labels
  fastify.get<RouteGenericOf<typeof getLabelsHandler>>('/labels',                     auth, getLabelsHandler);
  fastify.post<RouteGenericOf<typeof createLabelHandler>>('/labels',                    auth, createLabelHandler);
  fastify.delete<RouteGenericOf<typeof deleteLabelHandler>>('/labels/:labelId',         auth, deleteLabelHandler);
  fastify.post<RouteGenericOf<typeof assignLabelHandler>>('/posts/:postId/label',       auth, assignLabelHandler);
}
