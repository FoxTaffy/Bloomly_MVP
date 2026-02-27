import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { trackActivityHandler } from './controller.js';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  fastify.post('/track', auth, trackActivityHandler as any);
}
