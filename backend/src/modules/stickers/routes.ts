import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  listPacksHandler,
  getPackHandler,
  createPackHandler,
  updatePackHandler,
  deletePackHandler,
  getMyPacksHandler,
  getCollectionHandler,
  addToCollectionHandler,
  removeFromCollectionHandler,
  checkCollectionHandler,
  importTelegramHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function stickersRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // Public
  fastify.get('/',    listPacksHandler as any);
  fastify.get('/:id', getPackHandler   as any);

  // Auth
  fastify.post('/',      auth, createPackHandler           as any);
  fastify.patch('/:id',  auth, updatePackHandler           as any);
  fastify.delete('/:id', auth, deletePackHandler           as any);
  fastify.get('/me/packs',      auth, getMyPacksHandler        as any);
  fastify.get('/me/collection', auth, getCollectionHandler      as any);
  fastify.post('/:id/collect',  auth, addToCollectionHandler    as any);
  fastify.delete('/:id/collect',auth, removeFromCollectionHandler as any);
  fastify.get('/:id/collected', auth, checkCollectionHandler    as any);

  // Telegram import
  fastify.post('/import/telegram', auth, importTelegramHandler as any);
}
