import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  listPacksHandler,
  getPackHandler,
  findByUrlHandler,
  createPackHandler,
  updatePackHandler,
  deletePackHandler,
  getMyPacksHandler,
  getCollectionHandler,
  addToCollectionHandler,
  removeFromCollectionHandler,
  checkCollectionHandler,
  usePackHandler,
  importTelegramHandler,
  trackUsageHandler,
  getRecentUsedHandler,
  getFavoritesHandler,
  addFavoriteHandler,
  removeFavoriteHandler,
  addStickersToPackHandler,
  getPackStatsHandler,
} from './controller.js';

export async function stickersRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  const tryAuth: RouteShorthandOptions = { onRequest: [fastify.tryAuthenticate] };

  fastify.get<RouteGenericOf<typeof listPacksHandler>>('/',            tryAuth, listPacksHandler);
  fastify.get<RouteGenericOf<typeof findByUrlHandler>>('/find-by-url', auth, findByUrlHandler);
  fastify.get<RouteGenericOf<typeof getPackHandler>>('/:id',         tryAuth, getPackHandler);

  fastify.post<RouteGenericOf<typeof createPackHandler>>('/',      auth, createPackHandler);
  fastify.patch<RouteGenericOf<typeof updatePackHandler>>('/:id',  auth, updatePackHandler);
  fastify.delete<RouteGenericOf<typeof deletePackHandler>>('/:id', auth, deletePackHandler);
  fastify.get<RouteGenericOf<typeof getMyPacksHandler>>('/me/packs',      auth, getMyPacksHandler);
  fastify.get<RouteGenericOf<typeof getCollectionHandler>>('/me/collection', auth, getCollectionHandler);
  fastify.post<RouteGenericOf<typeof addToCollectionHandler>>('/:id/collect',  auth, addToCollectionHandler);
  fastify.delete<RouteGenericOf<typeof removeFromCollectionHandler>>('/:id/collect',auth, removeFromCollectionHandler);
  fastify.get<RouteGenericOf<typeof checkCollectionHandler>>('/:id/collected', auth, checkCollectionHandler);
  fastify.post<RouteGenericOf<typeof usePackHandler>>('/:id/use',      auth, usePackHandler);
  fastify.get<RouteGenericOf<typeof getPackStatsHandler>>('/:id/stats',     auth, getPackStatsHandler);

  fastify.post<RouteGenericOf<typeof addStickersToPackHandler>>('/:id/stickers', auth, addStickersToPackHandler);

  fastify.post<RouteGenericOf<typeof trackUsageHandler>>('/usage/track',  auth, trackUsageHandler);
  fastify.get<RouteGenericOf<typeof getRecentUsedHandler>>('/usage/recent',  auth, getRecentUsedHandler);

  fastify.get<RouteGenericOf<typeof getFavoritesHandler>>('/favorites',    auth, getFavoritesHandler);
  fastify.post<RouteGenericOf<typeof addFavoriteHandler>>('/favorites',   auth, addFavoriteHandler);
  fastify.delete<RouteGenericOf<typeof removeFavoriteHandler>>('/favorites', auth, removeFavoriteHandler);

  fastify.post<RouteGenericOf<typeof importTelegramHandler>>('/import/telegram', auth, importTelegramHandler);
}
