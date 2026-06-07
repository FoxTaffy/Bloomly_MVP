import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  getActiveUpdatesHandler,
  getAllUpdatesHandler,
  createUpdateHandler,
  deleteUpdateHandler,
  toggleUpdateHandler,
} from './controller.js';

export async function updatesRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // Public — active updates for the stories bar
  fastify.get('/', getActiveUpdatesHandler as any);

  // Admin — all updates
  fastify.get('/all', auth, getAllUpdatesHandler as any);

  // Admin — create update
  fastify.post('/', auth, createUpdateHandler as any);

  // Admin — delete update
  fastify.delete('/:id', auth, deleteUpdateHandler as any);

  // Admin — toggle active state
  fastify.patch('/:id/toggle', auth, toggleUpdateHandler as any);
}
