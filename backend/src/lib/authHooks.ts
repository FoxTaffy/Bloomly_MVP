import type { FastifyReply, FastifyRequest } from 'fastify';
import { isAdmin } from './roles.js';

/** onRequest hook (after `fastify.authenticate`): only admins and the owner may pass. */
export async function requireAdminRole(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user || !isAdmin(request.user.role)) {
    return reply.status(403).send({ success: false, error: 'Admin only' });
  }
}
