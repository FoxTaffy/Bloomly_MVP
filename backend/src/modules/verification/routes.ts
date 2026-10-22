import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  getStatusHandler,
  getCriteriaHandler,
  getCompletenessHandler,
  requestHandler,
  adminRequestsHandler,
  adminReviewHandler,
  adminOverrideHandler,
} from './controller.js';

export async function verificationRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // User endpoints
  fastify.get<RouteGenericOf<typeof getStatusHandler>>('/status',        auth, getStatusHandler);
  fastify.get<RouteGenericOf<typeof getCriteriaHandler>>('/criteria',      auth, getCriteriaHandler);
  fastify.get<RouteGenericOf<typeof getCompletenessHandler>>('/completeness',  auth, getCompletenessHandler);
  fastify.post<RouteGenericOf<typeof requestHandler>>('/request',      auth, requestHandler);

  // Admin endpoints
  fastify.get<RouteGenericOf<typeof adminRequestsHandler>>('/admin/requests',       auth, adminRequestsHandler);
  fastify.patch<RouteGenericOf<typeof adminReviewHandler>>('/admin/requests/:id', auth, adminReviewHandler);
  fastify.patch<RouteGenericOf<typeof adminOverrideHandler>>('/admin/requests/:id/override', auth, adminOverrideHandler);
}
