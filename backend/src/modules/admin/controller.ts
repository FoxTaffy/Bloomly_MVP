import { FastifyReply, FastifyRequest } from 'fastify';
import { adminService } from './service.js';
import prisma from '../../config/prisma.js';
import { isModerator, isAdmin, isOwner } from '../../lib/roles.js';
import { notificationService } from '../notifications/service.js';
import { usersService } from '../users/service.js';
import { applyAction, getPendingAppeals, decideAppeal } from '../automod/service.js';
import { getAllSettings, setSetting, type SettingKey } from '../../lib/settings.js';
import { isTrustedMediaUrl } from '../media/service.js';

interface JwtUser { id: string; role: string }

// Moderator, admin or owner — day-to-day moderation endpoints.
const requireMod = (req: FastifyRequest, reply: FastifyReply) => {
  const user = req.user as JwtUser;
  if (!isModerator(user.role)) {
    reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Requires moderator role or higher' } });
    return false;
  }
  return true;
};

// Admin or owner — operational endpoints not delegated to moderators (ads, banners, stats).
const requireAdmin = (req: FastifyRequest, reply: FastifyReply) => {
  const user = req.user as JwtUser;
  if (!isAdmin(user.role)) {
    reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Requires admin role or higher' } });
    return false;
  }
  return true;
};

// Owner only — role management.
const requireOwner = (req: FastifyRequest, reply: FastifyReply) => {
  const user = req.user as JwtUser;
  if (!isOwner(user.role)) {
    reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Only the owner can manage roles' } });
    return false;
  }
  return true;
};

// Shared audit-trail writer for staff actions that don't already log through
// AutoMod's freeze/unfreeze/warn/clear-warns paths. `targetUserId` is the user
// the action was taken against; falls back to the actor's own id for actions
// with no natural target (e.g. toggling a banner).
const logAdminAction = (actorId: string, targetUserId: string, action: string, reason: string) =>
  prisma.autoModLog.create({ data: { user_id: targetUserId, actor_id: actorId, action, reason, category: 'manual', score: 0 } }).catch(() => {});

export const getStatsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const stats = await adminService.getStats();
  return reply.send({ success: true, data: stats, error: null });
};

export const getUsersHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string; sortBy?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getUsers(page, limit, req.query.search, req.query.sortBy);
  return reply.send({ success: true, data: result, error: null });
};

export const updateUserSubscriptionHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { tier: string } }>,
  reply: FastifyReply,
) => {
  if (!requireAdmin(req, reply)) return;
  const actor = req.user as JwtUser;
  try {
    const user = await usersService.updateSubscriptionTier(req.params.id, req.body.tier);
    await logAdminAction(actor.id, req.params.id, 'subscription_change', `Тариф изменён на "${req.body.tier}"`);
    return reply.send({ success: true, data: { user }, error: null });
  } catch (err: any) {
    return reply.code(err.statusCode || 400).send({ success: false, data: null, error: { code: 'INVALID_TIER', message: err.message } });
  }
};

export const updateUserRoleHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { role: string; badge_type?: string | null } }>,
  reply: FastifyReply,
) => {
  if (!requireOwner(req, reply)) return;
  const actor = req.user as JwtUser;
  const user = await adminService.updateUserRole(req.params.id, req.body.role, req.body.badge_type);
  await logAdminAction(actor.id, req.params.id, 'role_change', `Роль изменена на "${req.body.role}"`);
  return reply.send({ success: true, data: { user }, error: null });
};

export const getStaffHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const staff = await adminService.getStaff();
  return reply.send({ success: true, data: { staff }, error: null });
};

export const promoteToStaffHandler = async (
  req: FastifyRequest<{ Body: { identifier: string; role: string } }>,
  reply: FastifyReply,
) => {
  if (!requireOwner(req, reply)) return;
  const { identifier, role } = req.body ?? {};
  if (!identifier?.trim() || !['moderator', 'admin', 'owner'].includes(role)) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID', message: 'identifier и role (moderator/admin/owner) обязательны' } });
  }
  try {
    const actor = req.user as JwtUser;
    const user = await adminService.promoteToStaff(identifier.trim(), role);
    await logAdminAction(actor.id, user.id, 'role_change', `Добавлен(а) в команду с ролью "${role}"`);
    return reply.send({ success: true, data: { user }, error: null });
  } catch (e: any) {
    return reply.code(404).send({ success: false, data: null, error: { code: e.code ?? 'ERROR', message: e.message } });
  }
};

export const getSettingsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const settings = await getAllSettings();
  return reply.send({ success: true, data: { settings }, error: null });
};

export const updateSettingHandler = async (
  req: FastifyRequest<{ Body: { key: string; value: boolean } }>,
  reply: FastifyReply,
) => {
  if (!requireAdmin(req, reply)) return;
  const { key, value } = req.body ?? ({} as any);
  if (!['open_registration', 'automod_enabled', 'maintenance_mode'].includes(key) || typeof value !== 'boolean') {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID', message: 'Некорректный key/value' } });
  }
  await setSetting(key as SettingKey, value);
  const actor = req.user as JwtUser;
  await prisma.autoModLog.create({
    data: { user_id: actor.id, actor_id: actor.id, action: 'settings_change', reason: `Настройка "${key}" изменена на ${value}`, category: 'manual', score: 0 },
  });
  const settings = await getAllSettings();
  return reply.send({ success: true, data: { settings }, error: null });
};

export const sendBroadcastHandler = async (
  req: FastifyRequest<{ Body: { title: string; body: string; audience: 'all' | 'premium' | 'new' | 'staff' } }>,
  reply: FastifyReply,
) => {
  if (!requireAdmin(req, reply)) return;
  const { title, body, audience } = req.body ?? ({} as any);
  if (!title?.trim() || !body?.trim() || !['all', 'premium', 'new', 'staff'].includes(audience)) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID', message: 'title, body и audience обязательны' } });
  }
  const actor = req.user as JwtUser;
  const broadcast = await adminService.sendBroadcast(actor.id, title.trim(), body.trim(), audience);
  return reply.send({ success: true, data: { broadcast }, error: null });
};

export const getBroadcastsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
  const broadcasts = await adminService.getBroadcasts();
  return reply.send({ success: true, data: { broadcasts }, error: null });
};

export const deleteUserHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  // Banning/archiving is core moderator work — no admin-only gate here.
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  await adminService.deleteUser(req.params.id);
  await notificationService.create({ receiverId: req.params.id, type: 'automod_ban' });
  await logAdminAction(actor.id, req.params.id, 'ban', 'Аккаунт заблокирован модератором');
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

export const getFrozenUsersHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getFrozenUsers(page, limit, req.query.search);
  return reply.send({ success: true, data: result, error: null });
};

export const restoreUserHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  const user = await adminService.restoreUser(req.params.id);
  await logAdminAction(actor.id, req.params.id, 'unban', 'Аккаунт разбанен модератором');
  return reply.send({ success: true, data: { user }, error: null });
};

export const getPostsAdminHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string; filter?: 'media' | 'nsfw' | 'announcement' } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getPosts(page, limit, req.query.search, req.query.filter);
  return reply.send({ success: true, data: result, error: null });
};

export const deletePostAdminHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  const post = await adminService.deletePost(req.params.id);
  await logAdminAction(actor.id, post.author_id, 'delete_post', 'Пост удалён модератором');
  return reply.send({ success: true, data: null, error: null });
};

export const togglePostPinHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  const post = await adminService.togglePostPin(req.params.id);
  await logAdminAction(actor.id, post.author_id, post.is_announcement ? 'pin_post' : 'unpin_post', post.is_announcement ? 'Пост закреплён' : 'Пост откреплён');
  return reply.send({ success: true, data: { post }, error: null });
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

const MAX_REPORT_EVIDENCE_FILES = 5;

export const submitReportHandler = async (
  req: FastifyRequest<{ Body: { targetType: string; targetId: string; reason: string; evidenceUrls?: string[] } }>,
  reply: FastifyReply,
) => {
  const { id: reporterId } = req.user as JwtUser;
  const { targetType, targetId, reason, evidenceUrls } = req.body;
  // Only accept URLs our own upload endpoint produced, and only up to the cap —
  // a raw client can otherwise post an arbitrarily large/external array of "evidence".
  const trustedEvidenceUrls = Array.isArray(evidenceUrls)
    ? evidenceUrls.filter(url => typeof url === 'string' && isTrustedMediaUrl(url)).slice(0, MAX_REPORT_EVIDENCE_FILES)
    : [];
  const report = await adminService.createReport({ reporterId, targetType, targetId, reason, evidenceUrls: trustedEvidenceUrls });
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

export const resolveReportsBatchHandler = async (
  req: FastifyRequest<{ Body: { ids: string[]; status: 'reviewed' | 'dismissed'; note?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const { id: resolverId } = req.user as JwtUser;
  const { ids, status, note } = req.body;
  await adminService.resolveReportsBatch(ids, resolverId, status, note);
  await logAdminAction(resolverId, resolverId, status === 'dismissed' ? 'dismiss_report' : 'resolve_report', `${status === 'dismissed' ? 'Отклонено' : 'Решено'} жалоб: ${ids.length}`);
  return reply.send({ success: true, data: { count: ids.length }, error: null });
};

export const resolveReportIssueHandler = async (
  req: FastifyRequest<{ Body: {
    ids: string[]; targetType: string; targetId: string;
    deleteContent: boolean; reason: string; category: string; imageUrl?: string;
  } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const { id: resolverId } = req.user as JwtUser;
  const { ids, targetType, targetId, deleteContent, reason, category, imageUrl } = req.body;
  if (!reason?.trim()) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_INPUT', message: 'reason is required' } });
  }
  await adminService.resolveReportIssue({ reportIds: ids, targetType, targetId, deleteContent, reason: reason.trim(), category, imageUrl, resolverId });
  await logAdminAction(resolverId, resolverId, 'resolve_report_issue', `Решена жалоба (${targetType}) с предупреждением: ${reason.trim()}`);
  return reply.send({ success: true, data: { count: ids.length }, error: null });
};

export const getAppealsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const appeals = await getPendingAppeals();
  return reply.send({ success: true, data: { appeals }, error: null });
};

export const decideAppealHandler = async (
  req: FastifyRequest<{ Params: { logId: string }; Body: { decision: 'accepted' | 'rejected' } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  try {
    await decideAppeal(req.params.logId, actor.id, req.body.decision);
    return reply.send({ success: true, data: null, error: null });
  } catch (err: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'APPEAL_ERROR', message: err.message } });
  }
};

export const getAdsHandler = async (
  req: FastifyRequest<{ Querystring: { status?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireAdmin(req, reply)) return;
  const ads = await adminService.getAds(req.query.status);
  return reply.send({ success: true, data: { ads }, error: null });
};

export const getActiveAdsHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  const ads = await adminService.getActiveAds();
  return reply.send({ success: true, data: { ads }, error: null });
};

export const submitAdHandler = async (
  req: FastifyRequest<{ Body: { title: string; description?: string; imageUrl?: string; linkUrl: string; contactInfo?: string; priceLabel?: string } }>,
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
  if (!requireAdmin(req, reply)) return;
  const { id: reviewerId } = req.user as JwtUser;
  const ad = await adminService.reviewAd(req.params.id, reviewerId, req.body.status, {
    startsAt: req.body.startsAt ? new Date(req.body.startsAt) : undefined,
    endsAt:   req.body.endsAt   ? new Date(req.body.endsAt)   : undefined,
  });
  await logAdminAction(reviewerId, (ad as any).requester_id ?? reviewerId, req.body.status === 'active' ? 'approve_ad' : 'reject_ad', `Реклама "${ad.title}" ${req.body.status === 'active' ? 'одобрена' : 'отклонена'}`);
  return reply.send({ success: true, data: { ad }, error: null });
};

export const deleteAdHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireAdmin(req, reply)) return;
  await adminService.deleteAd(req.params.id);
  return reply.send({ success: true, data: null, error: null });
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
export const getBannersHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
  const banners = await adminService.getBanners();
  return reply.send({ success: true, data: { banners }, error: null });
};

export const getActiveBannersHandler = async (_req: FastifyRequest, reply: FastifyReply) => {
  const banners = await adminService.getActiveBanners();
  return reply.send({ success: true, data: { banners }, error: null });
};

export const createBannerHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
  try {
    const banner = await adminService.createBanner(req.body as any);
    return reply.status(201).send({ success: true, data: { banner }, error: null });
  } catch (err: any) {
    if (err.code === 'LIMIT') return reply.status(400).send({ success: false, data: null, error: { code: 'LIMIT', message: err.message } });
    return reply.status(500).send({ success: false, data: null, error: { code: 'ERROR', message: String(err) } });
  }
};

export const updateBannerHandler = async (req: FastifyRequest<{ Params: { id: string }; Body: { is_active?: boolean } }>, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
  const banner = await adminService.updateBanner(req.params.id, req.body as any);
  if (typeof req.body?.is_active === 'boolean') {
    const actor = req.user as JwtUser;
    await logAdminAction(actor.id, actor.id, req.body.is_active ? 'activate_banner' : 'deactivate_banner', `Баннер "${banner.title}" ${req.body.is_active ? 'включён' : 'скрыт'}`);
  }
  return reply.send({ success: true, data: { banner }, error: null });
};

export const deleteBannerHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
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
      include: {
        user:  { select: { id: true, username: true, display_name: true, avatar_url: true } },
        actor: { select: { id: true, username: true, display_name: true, avatar_url: true } },
      },
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
    data: { user_id: req.params.id, actor_id: actor.id, action: 'unfreeze', reason: 'Разморожен вручную модератором', category: 'manual', score: 0 },
  });
  await notificationService.create({ receiverId: req.params.id, type: 'automod_unfreeze' });
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
    data: { user_id: req.params.id, actor_id: actor.id, action: 'freeze', reason, category: 'manual', score: 0 },
  });
  await notificationService.create({ receiverId: req.params.id, type: 'automod_freeze', meta: { reason } });
  return reply.send({ success: true, data: null, error: null });
};

export const markDeceasedHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { note?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const note = req.body?.note ?? null;
  await prisma.user.update({ where: { id: req.params.id }, data: { deceased_at: new Date(), deceased_note: note } });
  return reply.send({ success: true, data: null, error: null });
};

export const unmarkDeceasedHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  await prisma.user.update({ where: { id: req.params.id }, data: { deceased_at: null, deceased_note: null } });
  return reply.send({ success: true, data: null, error: null });
};

export const warnUserHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { reason?: string; postId?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  const reason = req.body?.reason?.trim() || 'Предупреждение от модератора';
  await applyAction(req.params.id, 'warn', 'manual', reason, undefined, req.body?.postId, actor.id);
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { warn_count: true, frozen_at: true } });
  return reply.send({ success: true, data: { warn_count: user?.warn_count ?? 0, frozen_at: user?.frozen_at ?? null }, error: null });
};

export const clearWarnsHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const actor = req.user as JwtUser;
  await prisma.user.update({ where: { id: req.params.id }, data: { warn_count: 0 } });
  await prisma.autoModLog.create({
    data: { user_id: req.params.id, actor_id: actor.id, action: 'clear_warns', reason: 'Предупреждения сброшены модератором', category: 'manual', score: 0 },
  });
  await notificationService.create({ receiverId: req.params.id, type: 'automod_clear_warns' });
  return reply.send({ success: true, data: null, error: null });
};

export const getInfraOverviewHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const data = await adminService.getInfraOverview();
  return reply.send({ success: true, data, error: null });
};

export const getGroupsOverviewHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const data = await adminService.getGroupsOverview();
  return reply.send({ success: true, data, error: null });
};

export const getPremiumOverviewHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireMod(req, reply)) return;
  const data = await adminService.getPremiumOverview();
  return reply.send({ success: true, data, error: null });
};

export const getStickerStatsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
  const data = await adminService.getStickerStats();
  return reply.send({ success: true, data, error: null });
};

export const getNetworkStatsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
  const data = await adminService.getNetworkStats();
  return reply.send({ success: true, data, error: null });
};
