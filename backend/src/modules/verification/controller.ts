import { FastifyRequest, FastifyReply } from 'fastify';
import {
  checkCriteria,
  getVerificationStatus,
  requestVerification,
  adminGetRequests,
  adminReviewRequest,
  getProfileCompleteness,
} from './service.js';
import { isModerator } from '../../lib/roles.js';
import prisma from '../../config/prisma.js';

// GET /api/verification/status
export async function getStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any).id;
  const data = await getVerificationStatus(userId);
  return reply.send({ success: true, data });
}

// GET /api/verification/criteria
export async function getCriteriaHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any).id;
  const criteria = await checkCriteria(userId);
  return reply.send({ success: true, data: criteria });
}

// GET /api/verification/completeness
export async function getCompletenessHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any).id;
  const data = await getProfileCompleteness(userId);
  return reply.send({ success: true, data });
}

// POST /api/verification/request
export async function requestHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any).id;
  const { verificationType, evidenceUrls, socialLinks, evidenceText } = request.body as any;
  try {
    const result = await requestVerification(userId, verificationType, evidenceUrls, socialLinks, evidenceText);
    return reply.send({ success: true, data: result });
  } catch (err: any) {
    return reply.code(400).send({ success: false, error: { message: err.message } });
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
    await prisma.autoModLog.create({
      data: {
        user_id: (result as any).user_id ?? user.id, actor_id: user.id,
        action: action === 'approve' ? 'verify_profile' : 'reject_verification',
        reason: action === 'approve' ? 'Профиль верифицирован' : (reason || 'Заявка на верификацию отклонена'),
        category: 'manual', score: 0,
      },
    }).catch(() => {});
    return reply.send({ success: true, data: result });
  } catch (err: any) {
    return reply.code(400).send({ success: false, error: { message: err.message } });
  }
}
