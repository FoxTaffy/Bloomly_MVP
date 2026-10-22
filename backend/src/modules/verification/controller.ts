import { FastifyRequest, FastifyReply } from 'fastify';
import { logStaffAction } from '../automod/logs.service.js';
import {
  checkCriteria,
  getVerificationStatus,
  requestVerification,
  adminGetRequests,
  adminReviewRequest,
  adminOverrideAgentDecision,
  getProfileCompleteness,
} from './service.js';
import { isModerator } from '../../lib/roles.js';
import { errMessage } from '../../lib/httpErrors.js';
import { reviewVerificationRequest } from '../agents/verification/agent.js';
import { logger } from '../../lib/logger.js';

// GET /api/verification/status
export async function getStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const data = await getVerificationStatus(userId);
  return reply.send({ success: true, data });
}

// GET /api/verification/criteria
export async function getCriteriaHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const criteria = await checkCriteria(userId);
  return reply.send({ success: true, data: criteria });
}

// GET /api/verification/completeness
export async function getCompletenessHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const data = await getProfileCompleteness(userId);
  return reply.send({ success: true, data });
}

// POST /api/verification/request
export async function requestHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.id;
  const { verificationType, evidenceUrls, socialLinks, evidenceText } = request.body as any;
  try {
    const result = await requestVerification(userId, verificationType, evidenceUrls, socialLinks, evidenceText);
    // Агент берёт заявку сразу, не дожидаясь cron; сбой здесь не должен ломать подачу (cron повторит).
    void reviewVerificationRequest(result.request.id).catch((err) => logger.error({ err }, '[verification-agent] быстрый разбор не удался'));
    return reply.send({ success: true, data: result });
  } catch (err) {
    return reply.code(400).send({ success: false, error: { message: errMessage(err) } });
  }
}

// GET /api/verification/admin/requests
export async function adminRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any;
  if (!isModerator(user.role)) {
    return reply.code(403).send({ success: false, error: { message: 'Forbidden' } });
  }
  const { status, page } = request.query as any;
  if (status && !['pending', 'approved', 'rejected'].includes(status)) {
    return reply.code(400).send({ success: false, error: { message: 'Invalid status' } });
  }
  const data = await adminGetRequests(status, parseInt(page) || 1);
  return reply.send({ success: true, data });
}

// PATCH /api/verification/admin/requests/:id
export async function adminReviewHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any;
  if (!isModerator(user.role)) {
    return reply.code(403).send({ success: false, error: { message: 'Forbidden' } });
  }
  const { id } = request.params as any;
  const { action, reason } = request.body as any;
  if (!['approve', 'reject'].includes(action)) {
    return reply.code(400).send({ success: false, error: { message: 'Invalid action' } });
  }
  try {
    const result = await adminReviewRequest(id, action, user.id, reason);
    await logStaffAction(
      user.id,
      result.user_id ?? user.id,
      action === 'approve' ? 'verify_profile' : 'reject_verification',
      action === 'approve' ? 'Профиль верифицирован' : (reason || 'Заявка на верификацию отклонена'),
    ).catch(() => {});
    return reply.send({ success: true, data: result });
  } catch (err) {
    return reply.code(400).send({ success: false, error: { message: errMessage(err) } });
  }
}

// PATCH /api/verification/admin/requests/:id/override — обжалование решения агента
export async function adminOverrideHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any;
  if (!isModerator(user.role)) {
    return reply.code(403).send({ success: false, error: { message: 'Forbidden' } });
  }
  const { id } = request.params as any;
  const { action, reason } = request.body as any;
  if (!['approve', 'reject'].includes(action)) {
    return reply.code(400).send({ success: false, error: { message: 'Invalid action' } });
  }
  try {
    const result = await adminOverrideAgentDecision(id, action, user.id, reason);
    await logStaffAction(
      user.id,
      result.user_id,
      action === 'approve' ? 'verify_profile' : 'reject_verification',
      `Решение агента изменено: ${reason || (action === 'approve' ? 'одобрено' : 'отклонено')}`.slice(0, 300),
    ).catch(() => {});
    return reply.send({ success: true, data: result });
  } catch (err) {
    return reply.code(400).send({ success: false, error: { message: errMessage(err) } });
  }
}
