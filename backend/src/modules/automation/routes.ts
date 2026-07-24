import type { FastifyInstance } from 'fastify';
import { getAutomationSettingsHandler, updateAutomationSettingsHandler } from './controller.js';
import { updateAutomationSchema } from './schemas.js';

export async function automationRoutes(fastify: FastifyInstance) {
  // GET /api/automation/me — own automation settings (never exposed to other users)
  fastify.get('/me', { onRequest: [fastify.authenticate] }, getAutomationSettingsHandler as any);

  // PATCH /api/automation/me — partial update
  fastify.patch('/me', { schema: updateAutomationSchema, onRequest: [fastify.authenticate] }, updateAutomationSettingsHandler as any);
}
