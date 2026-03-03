import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  getStatusHandler,
  getCriteriaHandler,
  requestHandler,
  adminRequestsHandler,
  adminReviewHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function verificationRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // User endpoints
  fastify.get('/status',    auth, getStatusHandler as any);
  fastify.get('/criteria',  auth, getCriteriaHandler as any);
  fastify.post('/request',  auth, requestHandler as any);

  // Admin endpoints
  fastify.get('/admin/requests',       auth, adminRequestsHandler as any);
  fastify.patch('/admin/requests/:id', auth, adminReviewHandler as any);
}
