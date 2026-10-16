import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  getActiveUpdatesHandler,
  getAllUpdatesHandler,
  createUpdateHandler,
  deleteUpdateHandler,
  toggleUpdateHandler,
} from './controller.js';

export async function updatesRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // Public — active updates for the announcement modal
  fastify.get<RouteGenericOf<typeof getActiveUpdatesHandler>>('/', getActiveUpdatesHandler);

  // Admin — all updates
  fastify.get<RouteGenericOf<typeof getAllUpdatesHandler>>('/all', auth, getAllUpdatesHandler);

  // Admin — create update
  fastify.post<RouteGenericOf<typeof createUpdateHandler>>('/', auth, createUpdateHandler);

  // Admin — delete update
  fastify.delete<RouteGenericOf<typeof deleteUpdateHandler>>('/:id', auth, deleteUpdateHandler);

  // Admin — toggle active state
  fastify.patch<RouteGenericOf<typeof toggleUpdateHandler>>('/:id/toggle', auth, toggleUpdateHandler);
}
