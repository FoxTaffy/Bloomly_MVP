import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  getAutoModLogsHandler,
  getAutoModStatsHandler,
  analyzeTextHandler,
  runPatrolHandler,
  submitAppealHandler,
  getOwnWarningHandler,
} from './controller.js';

export async function automodRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // GET /api/automod/logs — list automod action logs (mod/admin)
  fastify.get<RouteGenericOf<typeof getAutoModLogsHandler>>('/logs',  auth, getAutoModLogsHandler);

  // GET /api/automod/stats — aggregated stats (mod/admin)
  fastify.get<RouteGenericOf<typeof getAutoModStatsHandler>>('/stats', auth, getAutoModStatsHandler);

  // POST /api/automod/analyze — analyze text on-demand (mod/admin)
  fastify.post<RouteGenericOf<typeof analyzeTextHandler>>('/analyze', auth, analyzeTextHandler);

  // POST /api/automod/patrol — manually trigger suspicious activity patrol (admin only)
  fastify.post<RouteGenericOf<typeof runPatrolHandler>>('/patrol', auth, runPatrolHandler);

  // GET /api/automod/warnings/:logId — user fetches one of their own warning logs (for the violation modal)
  fastify.get<RouteGenericOf<typeof getOwnWarningHandler>>('/warnings/:logId', auth, getOwnWarningHandler);

  // POST /api/automod/warnings/:logId/appeal — user appeals one of their own warnings
  fastify.post<RouteGenericOf<typeof submitAppealHandler>>('/warnings/:logId/appeal', auth, submitAppealHandler);
}
