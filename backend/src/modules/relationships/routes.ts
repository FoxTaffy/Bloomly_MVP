import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  sendRequestHandler, acceptRequestHandler, declineRequestHandler,
  cancelRequestHandler, clearPartnershipHandler, getPendingHandler,
} from './controller.js';

export async function relationshipsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // GET  /api/relationships/pending  — incoming pending requests
  fastify.get('/pending', auth, getPendingHandler as any);

  // POST /api/relationships/request  — send a request { toId }
  fastify.post('/request', auth, sendRequestHandler as any);

  // DELETE /api/relationships/partner — break up (unlink both users)
  fastify.delete('/partner', auth, clearPartnershipHandler as any);

  // POST /api/relationships/:id/accept
  fastify.post('/:id/accept', auth, acceptRequestHandler as any);

  // POST /api/relationships/:id/decline
  fastify.post('/:id/decline', auth, declineRequestHandler as any);

  // DELETE /api/relationships/request — cancel own outgoing { toId }
  fastify.delete('/request', auth, cancelRequestHandler as any);
}
