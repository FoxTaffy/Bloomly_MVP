import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import { trackActivityHandler } from './controller.js';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  fastify.post<RouteGenericOf<typeof trackActivityHandler>>('/track', auth, trackActivityHandler);
}
