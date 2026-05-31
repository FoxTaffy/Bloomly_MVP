import { FastifyReply, FastifyRequest } from 'fastify';
import { adminService } from './service.js';
import prisma from '../../config/prisma.js';

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

// ── Sticker Banner handlers ────────────────────────────────────────────────
export const getBannersHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  const banners = await adminService.getBanners();
  return reply.send({ success: true, data: { banners }, error: null });
};

export const getActiveBannersHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  const banners = await adminService.getActiveBanners();
  return reply.send({ success: true, data: { banners }, error: null });
};

export const createBannerHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  try {
    const banner = await adminService.createBanner(req.body as any);
    return reply.status(201).send({ success: true, data: { banner }, error: null });
  } catch (err: any) {
    if (err.code === 'LIMIT') return reply.status(400).send({ success: false, data: null, error: { code: 'LIMIT', message: err.message } });
    return reply.status(500).send({ success: false, data: null, error: { code: 'ERROR', message: String(err) } });
  }
};

export const updateBannerHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const banner = await adminService.updateBanner(req.params.id, req.body as any);
  return reply.send({ success: true, data: { banner }, error: null });
};

export const deleteBannerHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  await adminService.deleteBanner(req.params.id);
  return reply.send({ success: true, data: null, error: null });
};

// ── AutoMod endpoints ─────────────────────────────────────────────────────────

export const getAutoModLogsHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; userId?: string; action?: string; category?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const page  = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const limit = 50;
  const skip  = (page - 1) * limit;
  const where: Record<string, any> = {};
  if (req.query.userId)   where.user_id  = req.query.userId;
  if (req.query.action)   where.action   = req.query.action;
  if (req.query.category) where.category = req.query.category;

  const [logs, total] = await Promise.all([
    prisma.autoModLog.findMany({
      where,
      include: { user: { select: { id: true, username: true, avatar_url: true } } },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.autoModLog.count({ where }),
  ]);
  return reply.send({ success: true, data: { logs, total, page, pages: Math.ceil(total / limit) }, error: null });
};

export const unfreezeUserHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  await prisma.user.update({ where: { id: req.params.id }, data: { frozen_at: null, frozen_reason: null } });
  await prisma.autoModLog.create({
    data: { user_id: req.params.id, action: 'unfreeze', reason: `Разморожен вручную модератором ${actor.id}`, category: 'manual', score: 0 },
  });
  return reply.send({ success: true, data: null, error: null });
};

export const freezeUserHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  const reason = req.body?.reason ?? 'Заморожен вручную модератором';
  await prisma.user.update({ where: { id: req.params.id }, data: { frozen_at: new Date(), frozen_reason: reason } });
  await prisma.autoModLog.create({
    data: { user_id: req.params.id, action: 'freeze', reason: `${reason} (мод: ${actor.id})`, category: 'manual', score: 0 },
  });
  return reply.send({ success: true, data: null, error: null });
};

export const clearWarnsHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  await prisma.user.update({ where: { id: req.params.id }, data: { warn_count: 0 } });
  await prisma.autoModLog.create({
    data: { user_id: req.params.id, action: 'clear_warns', reason: `Предупреждения сброшены модератором ${actor.id}`, category: 'manual', score: 0 },
  });
  return reply.send({ success: true, data: null, error: null });
};

export const getStickerStatsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const data = await adminService.getStickerStats();
  return reply.send({ success: true, data, error: null });
};

export const getNetworkStatsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const data = await adminService.getNetworkStats();
  return reply.send({ success: true, data, error: null });
};
