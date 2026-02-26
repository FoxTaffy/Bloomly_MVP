import { FastifyInstance } from 'fastify';
import { trackActivityHandler } from './controller.js';

export default async function analyticsRoutes(fastify: FastifyInstance) {
  fastify.post('/track', { onRequest: [fastify.authenticate] }, trackActivityHandler);
}
