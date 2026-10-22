import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import { agentsOverviewHandler, agentsLogsHandler, runVerificationHandler } from './controller.js';

export async function agentsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  fastify.get<RouteGenericOf<typeof agentsOverviewHandler>>('/', auth, agentsOverviewHandler);
  fastify.get<RouteGenericOf<typeof agentsLogsHandler>>('/logs', auth, agentsLogsHandler);
  fastify.post<RouteGenericOf<typeof runVerificationHandler>>('/verification/run', auth, runVerificationHandler);
}
