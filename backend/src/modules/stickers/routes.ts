import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
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

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function stickersRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  fastify.get('/',            listPacksHandler as any);
  fastify.get('/find-by-url', auth, findByUrlHandler as any);
  fastify.get('/:id',         getPackHandler   as any);

  fastify.post('/',      auth, createPackHandler            as any);
  fastify.patch('/:id',  auth, updatePackHandler            as any);
  fastify.delete('/:id', auth, deletePackHandler            as any);
  fastify.get('/me/packs',      auth, getMyPacksHandler         as any);
  fastify.get('/me/collection', auth, getCollectionHandler       as any);
  fastify.post('/:id/collect',  auth, addToCollectionHandler     as any);
  fastify.delete('/:id/collect',auth, removeFromCollectionHandler as any);
  fastify.get('/:id/collected', auth, checkCollectionHandler     as any);
  fastify.post('/:id/use',      auth, usePackHandler              as any);
  fastify.get('/:id/stats',     auth, getPackStatsHandler         as any);

  fastify.post('/:id/stickers', auth, addStickersToPackHandler   as any);

  fastify.post('/usage/track',  auth, trackUsageHandler     as any);
  fastify.get('/usage/recent',  auth, getRecentUsedHandler   as any);

  fastify.get('/favorites',    auth, getFavoritesHandler     as any);
  fastify.post('/favorites',   auth, addFavoriteHandler      as any);
  fastify.delete('/favorites', auth, removeFavoriteHandler   as any);

  fastify.post('/import/telegram', auth, importTelegramHandler as any);
}
