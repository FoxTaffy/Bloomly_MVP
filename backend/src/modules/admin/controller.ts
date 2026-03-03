import { FastifyReply, FastifyRequest } from 'fastify';
import { adminService } from './service.js';

interface JwtUser { id: string; role: string }

const requireMod = (req: FastifyRequest, reply: FastifyReply) => {
  const user = req.user as JwtUser;
  if (!['admin', 'moderator'].includes(user.role)) {
    reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Requires moderator or admin role' } });
    return false;
  }
  return true;
};

export const getStatsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const stats = await adminService.getStats();
  return reply.send({ success: true, data: stats, error: null });
};

export const getUsersHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getUsers(page, limit, req.query.search);
  return reply.send({ success: true, data: result, error: null });
};

export const updateUserRoleHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { role: string; badge_type?: string | null } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  if (actor.role !== 'admin') {
    return reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Only admins can change roles' } });
  }
  const user = await adminService.updateUserRole(req.params.id, req.body.role, req.body.badge_type ?? null);
  return reply.send({ success: true, data: { user }, error: null });
};

export const deleteUserHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  if (actor.role !== 'admin') {
    return reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Only admins can delete users' } });
  }
  await adminService.deleteUser(req.params.id);
  return reply.send({ success: true, data: null, error: null });
};

export const getArchivedUsersHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getArchivedUsers(page, limit, req.query.search);
  return reply.send({ success: true, data: result, error: null });
};

export const restoreUserHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  if (actor.role !== 'admin') {
    return reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Only admins can restore users' } });
  }
  const user = await adminService.restoreUser(req.params.id);
  return reply.send({ success: true, data: { user }, error: null });
};

export const getPostsAdminHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getPosts(page, limit, req.query.search);
  return reply.send({ success: true, data: result, error: null });
};

export const deletePostAdminHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  await adminService.deletePost(req.params.id);
  return reply.send({ success: true, data: null, error: null });
};

export const getReportsHandler = async (
  req: FastifyRequest<{ Querystring: { status?: string; page?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getReports(req.query.status, page, limit);
  return reply.send({ success: true, data: result, error: null });
};

export const submitReportHandler = async (
  req: FastifyRequest<{ Body: { targetType: string; targetId: string; reason: string } }>,
  reply: FastifyReply,
) => {
  const { id: reporterId } = req.user as JwtUser;
  const { targetType, targetId, reason } = req.body;
  const report = await adminService.createReport({ reporterId, targetType, targetId, reason });
  return reply.code(201).send({ success: true, data: { report }, error: null });
};

export const resolveReportHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { status: 'reviewed' | 'dismissed'; note?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const { id: resolverId } = req.user as JwtUser;
  const report = await adminService.resolveReport(req.params.id, resolverId, req.body.status, req.body.note);
  return reply.send({ success: true, data: { report }, error: null });
};

export const getAdsHandler = async (
  req: FastifyRequest<{ Querystring: { status?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const ads = await adminService.getAds(req.query.status);
  return reply.send({ success: true, data: { ads }, error: null });
};

export const getActiveAdsHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  const ads = await adminService.getActiveAds();
  return reply.send({ success: true, data: { ads }, error: null });
};

export const submitAdHandler = async (
  req: FastifyRequest<{ Body: { title: string; description?: string; imageUrl?: string; linkUrl: string; contactInfo?: string } }>,
  reply: FastifyReply,
) => {
  const requesterId = (req.user as JwtUser | undefined)?.id;
  const ad = await adminService.submitAd({ ...req.body, requesterId });
  return reply.code(201).send({ success: true, data: { ad }, error: null });
};

export const reviewAdHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { status: 'active' | 'rejected'; startsAt?: string; endsAt?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const { id: reviewerId } = req.user as JwtUser;
  const ad = await adminService.reviewAd(req.params.id, reviewerId, req.body.status, {
    startsAt: req.body.startsAt ? new Date(req.body.startsAt) : undefined,
    endsAt:   req.body.endsAt   ? new Date(req.body.endsAt)   : undefined,
  });
  return reply.send({ success: true, data: { ad }, error: null });
};

export const trackImpressionHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  await adminService.trackAdImpression(req.params.id);
  return reply.send({ success: true, data: null, error: null });
};

export const trackClickHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  await adminService.trackAdClick(req.params.id);
  return reply.send({ success: true, data: null, error: null });
};
