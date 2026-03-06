import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  listListingsHandler,
  getListingHandler,
  createListingHandler,
  updateListingHandler,
  deleteListingHandler,
  getMyListingsHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function dealersDenRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  fastify.get('/',          listListingsHandler as any);
  fastify.get('/me',  auth, getMyListingsHandler as any);
  fastify.get('/:id',       getListingHandler as any);
  fastify.post('/',   auth, createListingHandler as any);
  fastify.patch('/:id', auth, updateListingHandler as any);
  fastify.delete('/:id', auth, deleteListingHandler as any);
}
