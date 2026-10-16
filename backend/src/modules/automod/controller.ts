import { FastifyReply, FastifyRequest } from 'fastify';
import { autoModLogs } from './logs.service.js';
import { requireModerator, requireAdmin } from '../../lib/authHooks.js';
import { analyzeContent, patrolSuspiciousActivity, submitAppeal, getOwnWarningLog } from './service.js';
import { errMessage } from '../../lib/httpErrors.js';
import { logError } from '../../lib/logger.js';

export const getAutoModLogsHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; userId?: string; action?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const page  = Math.max(1, parseInt(req.query.page  || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50')));
  const { logs, total, pages } = await autoModLogs.list({ page, limit, userId: req.query.userId, action: req.query.action });
  return reply.send({ success: true, data: { logs, total, page, limit, totalPages: pages }, error: null });
};

export const getAutoModStatsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
  return reply.send({ success: true, data: await autoModLogs.stats(), error: null });
};

export const analyzeTextHandler = async (
  req: FastifyRequest<{ Body: { text: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;

  const { text } = req.body;
  if (!text || typeof text !== 'string') {
    return reply.code(400).send({
      success: false,
      data: null,
      error: { code: 'INVALID_INPUT', message: 'text is required' },
    });
  }

  const result = analyzeContent(text);
  return reply.send({ success: true, data: result, error: null });
};

export const runPatrolHandler = async (
  req: FastifyRequest,
  reply: FastifyReply,
) => {
  if (!requireAdmin(req, reply)) return;

  // fire-and-forget
  patrolSuspiciousActivity().catch(logError('[AUTOMOD] Manual patrol error'));

  return reply.send({ success: true, data: { message: 'Patrol started' }, error: null });
};

export const getOwnWarningHandler = async (
  req: FastifyRequest<{ Params: { logId: string } }>,
  reply: FastifyReply,
) => {
  const user = req.user;
  const log = await getOwnWarningLog(req.params.logId, user.id);
  if (!log) return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Warning not found' } });
  return reply.send({ success: true, data: { log }, error: null });
};

export const submitAppealHandler = async (
  req: FastifyRequest<{ Params: { logId: string }; Body: { text: string } }>,
  reply: FastifyReply,
) => {
  const user = req.user;
  const text = req.body?.text?.trim();
  if (!text) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_INPUT', message: 'text is required' } });
  }
  try {
    const log = await submitAppeal(req.params.logId, user.id, text);
    return reply.send({ success: true, data: { log }, error: null });
  } catch (err) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'APPEAL_ERROR', message: errMessage(err) } });
  }
};
