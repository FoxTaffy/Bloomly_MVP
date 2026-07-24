import { FastifyInstance, RouteShorthandOptions } from 'fastify';
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
  fastify.get('/logs',  auth, getAutoModLogsHandler  as any);

  // GET /api/automod/stats — aggregated stats (mod/admin)
  fastify.get('/stats', auth, getAutoModStatsHandler as any);

  // POST /api/automod/analyze — analyze text on-demand (mod/admin)
  fastify.post('/analyze', auth, analyzeTextHandler  as any);

  // POST /api/automod/patrol — manually trigger suspicious activity patrol (admin only)
  fastify.post('/patrol', auth, runPatrolHandler     as any);

  // GET /api/automod/warnings/:logId — user fetches one of their own warning logs (for the violation modal)
  fastify.get('/warnings/:logId', auth, getOwnWarningHandler as any);

  // POST /api/automod/warnings/:logId/appeal — user appeals one of their own warnings
  fastify.post('/warnings/:logId/appeal', auth, submitAppealHandler as any);
}
