import { FastifyRequest, FastifyReply } from 'fastify';
import {
  checkCriteria,
  getVerificationStatus,
  requestVerification,
  adminGetRequests,
  adminReviewRequest,
} from './service.js';

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

// POST /api/verification/request
export async function requestHandler(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request.user as any).id;
  try {
    const result = await requestVerification(userId);
    return reply.send({ success: true, data: result });
  } catch (err: any) {
    return reply.code(400).send({ success: false, error: { message: err.message } });
  }
}

// GET /api/verification/admin/requests
export async function adminRequestsHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any;
  if (!['admin', 'moderator'].includes(user.role)) {
    return reply.code(403).send({ success: false, error: { message: 'Forbidden' } });
  }
  const { status, page } = request.query as any;
  const data = await adminGetRequests(status, parseInt(page) || 1);
  return reply.send({ success: true, data });
}

// PATCH /api/verification/admin/requests/:id
export async function adminReviewHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as any;
  if (!['admin', 'moderator'].includes(user.role)) {
    return reply.code(403).send({ success: false, error: { message: 'Forbidden' } });
  }
  const { id } = request.params as any;
  const { action, reason } = request.body as any;
  if (!['approve', 'reject'].includes(action)) {
    return reply.code(400).send({ success: false, error: { message: 'Invalid action' } });
  }
  try {
    const result = await adminReviewRequest(id, action, user.id, reason);
    return reply.send({ success: true, data: result });
  } catch (err: any) {
    return reply.code(400).send({ success: false, error: { message: err.message } });
  }
}
