import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  createActivityHandler,
  getActivityHandler,
  listGroupActivitiesHandler,
  joinActivityHandler,
  withdrawActivityHandler,
  updateParticipantStatusHandler,
  getTrustScoreHandler,
  deleteActivityHandler,
} from './controller.js';

export async function activitiesRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // CRUD
  fastify.post<RouteGenericOf<typeof createActivityHandler>>('/',          auth, createActivityHandler);
  fastify.get<RouteGenericOf<typeof getActivityHandler>>('/:id',        auth, getActivityHandler);
  fastify.delete<RouteGenericOf<typeof deleteActivityHandler>>('/:id',     auth, deleteActivityHandler);

  // Group activities
  fastify.get<RouteGenericOf<typeof listGroupActivitiesHandler>>('/group/:groupId', auth, listGroupActivitiesHandler);

  // Participation lifecycle
  fastify.post<RouteGenericOf<typeof joinActivityHandler>>('/:id/join',                              auth, joinActivityHandler);
  fastify.post<RouteGenericOf<typeof withdrawActivityHandler>>('/:id/withdraw',                          auth, withdrawActivityHandler);
  fastify.patch<RouteGenericOf<typeof updateParticipantStatusHandler>>('/:id/participants/:userId/status',      auth, updateParticipantStatusHandler);

  // TrustScore (public — no auth needed)
  fastify.get<RouteGenericOf<typeof getTrustScoreHandler>>('/trust/:userId', getTrustScoreHandler);
}
