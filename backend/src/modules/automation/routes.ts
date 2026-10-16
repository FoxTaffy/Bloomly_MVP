import type { FastifyInstance } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import { getAutomationSettingsHandler, updateAutomationSettingsHandler } from './controller.js';
import { updateAutomationSchema } from './schemas.js';

export async function automationRoutes(fastify: FastifyInstance) {
  // GET /api/automation/me — own automation settings (never exposed to other users)
  fastify.get<RouteGenericOf<typeof getAutomationSettingsHandler>>('/me', { onRequest: [fastify.authenticate] }, getAutomationSettingsHandler);

  // PATCH /api/automation/me — partial update
  fastify.patch<RouteGenericOf<typeof updateAutomationSettingsHandler>>('/me', { schema: updateAutomationSchema, onRequest: [fastify.authenticate] }, updateAutomationSettingsHandler);
}
