import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  getAutoModLogsHandler,
  getAutoModStatsHandler,
  analyzeTextHandler,
  runPatrolHandler,
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
}
