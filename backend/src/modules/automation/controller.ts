import type { FastifyRequest, FastifyReply } from 'fastify';
import { automationService } from './service.js';
import type { UpdateAutomationInput } from './types.js';
import type { JwtPayload } from '../users/types.js';

export async function getAutomationSettingsHandler(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.user as JwtPayload;
  const settings = await automationService.getSettings(payload.id);
  return reply.send({ success: true, data: { settings }, error: null });
}

export async function updateAutomationSettingsHandler(
  request: FastifyRequest<{ Body: UpdateAutomationInput }>,
  reply: FastifyReply,
) {
  const payload = request.user as JwtPayload;
  try {
    const settings = await automationService.updateSettings(payload.id, request.body);
    return reply.send({ success: true, data: { settings }, error: null });
  } catch (error: unknown) {
    const statusCode = (error as any)?.statusCode ?? 500;
    const message = error instanceof Error ? error.message : 'Failed to update automation settings';
    return reply.code(statusCode).send({ success: false, data: null, error: { code: 'UPDATE_AUTOMATION_ERROR', message } });
  }
}
