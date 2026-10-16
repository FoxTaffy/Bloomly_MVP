import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  sendRequestHandler, acceptRequestHandler, declineRequestHandler,
  cancelRequestHandler, clearPartnershipHandler, getPendingHandler,
} from './controller.js';

export async function relationshipsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // GET  /api/relationships/pending  — incoming pending requests
  fastify.get<RouteGenericOf<typeof getPendingHandler>>('/pending', auth, getPendingHandler);

  // POST /api/relationships/request  — send a request { toId }
  fastify.post<RouteGenericOf<typeof sendRequestHandler>>('/request', auth, sendRequestHandler);

  // DELETE /api/relationships/partner — break up (unlink both users)
  fastify.delete<RouteGenericOf<typeof clearPartnershipHandler>>('/partner', auth, clearPartnershipHandler);

  // POST /api/relationships/:id/accept
  fastify.post<RouteGenericOf<typeof acceptRequestHandler>>('/:id/accept', auth, acceptRequestHandler);

  // POST /api/relationships/:id/decline
  fastify.post<RouteGenericOf<typeof declineRequestHandler>>('/:id/decline', auth, declineRequestHandler);

  // DELETE /api/relationships/request — cancel own outgoing { toId }
  fastify.delete<RouteGenericOf<typeof cancelRequestHandler>>('/request', auth, cancelRequestHandler);
}
