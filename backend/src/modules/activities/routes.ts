import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
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

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function activitiesRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // CRUD
  fastify.post('/',          auth, createActivityHandler as any);
  fastify.get('/:id',        auth, getActivityHandler as any);
  fastify.delete('/:id',     auth, deleteActivityHandler as any);

  // Group activities
  fastify.get('/group/:groupId', auth, listGroupActivitiesHandler as any);

  // Participation lifecycle
  fastify.post('/:id/join',                              auth, joinActivityHandler as any);
  fastify.post('/:id/withdraw',                          auth, withdrawActivityHandler as any);
  fastify.patch('/:id/participants/:userId/status',      auth, updateParticipantStatusHandler as any);

  // TrustScore (public — no auth needed)
  fastify.get('/trust/:userId', getTrustScoreHandler as any);
}
