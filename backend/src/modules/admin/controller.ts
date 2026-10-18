import { FastifyReply, FastifyRequest } from 'fastify';
import { adminService } from './service.js';
import { moderationService } from './moderation.service.js';
import { autoModLogs, logStaffAction } from '../automod/logs.service.js';
import { userLookup } from '../users/lookup.js';
import { getFinanceReport } from './finance.service.js';
import { requireModerator, requireAdmin, requireOwner } from '../../lib/authHooks.js';
import { ROLE_RANK, canModerateTarget } from '../../lib/roles.js';
import { notificationService } from '../notifications/service.js';
import { usersService } from '../users/service.js';
import { applyAction, getPendingAppeals, decideAppeal } from '../automod/service.js';
import { getAllSettings, setSetting, type SettingKey } from '../../lib/settings.js';
import { assertOwnedMedia, findPrivateMediaRow, openPrivateObject } from '../media/service.js';
import { errCode, errMessage, errStatus } from '../../lib/httpErrors.js';

// Punitive actions (ban/freeze/warn) require the actor to outrank the target — otherwise
// a moderator could ban/freeze another moderator, an admin, or even the owner.
// Returns false (and already sent a 403) if the actor isn't allowed to act on this user;
// a missing target is left to the underlying action to 404/no-op on as before.
const requireCanModerate = async (req: FastifyRequest, reply: FastifyReply, targetUserId: string) => {
  const actor = req.user;
  const target = await moderationService.getRole(targetUserId);
  if (target && !canModerateTarget(actor.role, target.role)) {
    reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Недостаточно прав для действия над этим пользователем' } });
    return false;
  }
  return true;
};

// Shared audit-trail writer for staff actions that don't already log through
// AutoMod's freeze/unfreeze/warn/clear-warns paths. `targetUserId` is the user
// the action was taken against; falls back to the actor's own id for actions
// with no natural target (e.g. toggling a banner).
const logAdminAction = (actorId: string, targetUserId: string, action: string, reason: string) =>
  logStaffAction(actorId, targetUserId, action, reason).catch(() => {});

export const getStatsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
  const stats = await adminService.getStats();
  return reply.send({ success: true, data: stats, error: null });
};

export const getUsersHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string; sortBy?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
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
  const actor = req.user;
  try {
    // Staff-granted tiers are comps, not purchases — no saved card required.
    const user = await usersService.updateSubscriptionTier(req.params.id, req.body.tier, { skipPaymentCheck: true });
    await logAdminAction(actor.id, req.params.id, 'subscription_change', `Тариф изменён на "${req.body.tier}"`);
    return reply.send({ success: true, data: { user }, error: null });
  } catch (err) {
    return reply.code(errStatus(err) || 400).send({ success: false, data: null, error: { code: 'INVALID_TIER', message: errMessage(err) } });
  }
};

// Fields an admin may edit on someone else's profile. Role, subscription, verification and
// media stay out of this path on purpose — those have their own endpoints with their own rules.
const ADMIN_EDITABLE_PROFILE_FIELDS = ['display_name', 'bio', 'status', 'pronouns', 'location', 'website', 'job_title', 'country'] as const;

export const updateUserProfileHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: Record<string, string | undefined> }>,
  reply: FastifyReply,
) => {
  if (!requireAdmin(req, reply)) return;
  if (!(await requireCanModerate(req, reply, req.params.id))) return;
  const actor = req.user;

  const data: Record<string, string> = {};
  for (const field of ADMIN_EDITABLE_PROFILE_FIELDS) {
    if (typeof req.body[field] === 'string') data[field] = req.body[field] as string;
  }
  const { username } = req.body;
  if (Object.keys(data).length === 0 && typeof username !== 'string') {
    return reply.code(400).send({ success: false, data: null, error: { code: 'NOTHING_TO_UPDATE', message: 'No editable fields provided' } });
  }

  try {
    if (typeof username === 'string') {
      await usersService.updateUsername(req.params.id, username);
    }
    const user = Object.keys(data).length > 0
      ? await usersService.updateUser(req.params.id, data as any)
      : null;
    const changed = [...Object.keys(data), ...(typeof username === 'string' ? ['username'] : [])];
    await logAdminAction(actor.id, req.params.id, 'profile_edit', `Профиль изменён администратором: ${changed.join(', ')}`);
    return reply.send({ success: true, data: { user }, error: null });
  } catch (err) {
    const taken = errMessage(err) === 'Этот никнейм уже занят';
    return reply.code(taken ? 409 : 400).send({ success: false, data: null, error: { code: taken ? 'USERNAME_TAKEN' : 'PROFILE_UPDATE_FAILED', message: errMessage(err) } });
  }
};

export const updateUserRoleHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { role: string; badge_type?: string | null } }>,
  reply: FastifyReply,
) => {
  if (!requireOwner(req, reply)) return;
  if (!Object.keys(ROLE_RANK).includes(req.body.role)) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_ROLE', message: 'Неизвестная роль' } });
  }
  const actor = req.user;
  const user = await adminService.updateUserRole(req.params.id, req.body.role, req.body.badge_type);
  await logAdminAction(actor.id, req.params.id, 'role_change', `Роль изменена на "${req.body.role}"`);
  return reply.send({ success: true, data: { user }, error: null });
};

export const getSponsorsHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getSponsors(page, limit, req.query.search);
  return reply.send({ success: true, data: result, error: null });
};

export const updateUserSponsorHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { is_sponsor: boolean } }>,
  reply: FastifyReply,
) => {
  if (!requireAdmin(req, reply)) return;
  if (typeof req.body?.is_sponsor !== 'boolean') {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID', message: 'is_sponsor должен быть boolean' } });
  }
  const user = await adminService.setUserSponsor(req.params.id, req.body.is_sponsor);
  await logAdminAction(req.user.id, req.params.id, 'sponsor_change', req.body.is_sponsor ? 'Выдан статус спонсора' : 'Статус спонсора снят');
  return reply.send({ success: true, data: { user }, error: null });
};

export const getStaffHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
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
    const actor = req.user;
    const user = await adminService.promoteToStaff(identifier.trim(), role);
    await logAdminAction(actor.id, user.id, 'role_change', `Добавлен(а) в команду с ролью "${role}"`);
    return reply.send({ success: true, data: { user }, error: null });
  } catch (e) {
    return reply.code(404).send({ success: false, data: null, error: { code: errCode(e) ?? 'ERROR', message: errMessage(e) } });
  }
};

export const getSettingsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
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
  const actor = req.user;
  await logStaffAction(actor.id, actor.id, 'settings_change', `Настройка "${key}" изменена на ${value}`);
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
  const actor = req.user;
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
  if (!requireModerator(req, reply)) return;
  if (!(await requireCanModerate(req, reply, req.params.id))) return;
  const actor = req.user;
  await adminService.deleteUser(req.params.id);
  await notificationService.create({ receiverId: req.params.id, type: 'automod_ban' });
  await logAdminAction(actor.id, req.params.id, 'ban', 'Аккаунт заблокирован модератором');
  return reply.send({ success: true, data: null, error: null });
};

export const getArchivedUsersHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getArchivedUsers(page, limit, req.query.search);
  return reply.send({ success: true, data: result, error: null });
};

export const getFrozenUsersHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getFrozenUsers(page, limit, req.query.search);
  return reply.send({ success: true, data: result, error: null });
};

export const restoreUserHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  // Модератор не может снять бан с того, кого не может банить (иначе вернул бы админа/владельца)
  if (!(await requireCanModerate(req, reply, req.params.id))) return;
  const actor = req.user;
  const user = await adminService.restoreUser(req.params.id);
  await logAdminAction(actor.id, req.params.id, 'unban', 'Аккаунт разбанен модератором');
  return reply.send({ success: true, data: { user }, error: null });
};

export const getPostsAdminHandler = async (
  req: FastifyRequest<{ Querystring: { page?: string; limit?: string; search?: string; filter?: 'media' | 'nsfw' | 'announcement' } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getPosts(page, limit, req.query.search, req.query.filter);
  return reply.send({ success: true, data: result, error: null });
};

export const deletePostAdminHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const actor = req.user;
  const post = await adminService.deletePost(req.params.id);
  await logAdminAction(actor.id, post.author_id, 'delete_post', 'Пост удалён модератором');
  return reply.send({ success: true, data: null, error: null });
};

export const togglePostPinHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const actor = req.user;
  const post = await adminService.togglePostPin(req.params.id);
  await logAdminAction(actor.id, post.author_id, post.is_announcement ? 'pin_post' : 'unpin_post', post.is_announcement ? 'Пост закреплён' : 'Пост откреплён');
  return reply.send({ success: true, data: { post }, error: null });
};

export const getReportsHandler = async (
  req: FastifyRequest<{ Querystring: { status?: string; page?: string; limit?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const page  = parseInt(req.query.page  || '1');
  const limit = parseInt(req.query.limit || '30');
  const result = await adminService.getReports(req.query.status, page, limit);
  return reply.send({ success: true, data: result, error: null });
};

/**
 * GET /api/admin/reports/evidence?url=… — фото из жалобы. Лежит в закрытом префиксе private/reports/,
 * бакет напрямую его не отдаёт, поэтому читаем через API. Доступ: модератор, админ, владелец.
 * Обычному пользователю — 403. Остальные закрытые папки здесь не отдаются (их правила не менялись).
 * Подписанные ссылки не используем: файл отдаётся потоком, ссылка в БД остаётся прежней.
 */
export const getReportEvidenceHandler = async (
  req: FastifyRequest<{ Querystring: { url?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const url = req.query.url;
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_URL', message: 'Некорректная ссылка' } });
  }
  const row = await findPrivateMediaRow(url);
  if (!row || row.deleted_at || row.folder !== 'reports') {
    return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Файл не найден' } });
  }
  let opened;
  try {
    opened = await openPrivateObject(row.object_key);
  } catch {
    // Запись есть, а объекта в хранилище уже нет: фронт покажет заглушку
    return reply.code(404).send({ success: false, data: null, error: { code: 'FILE_MISSING', message: 'Файл недоступен' } });
  }
  reply.header('Cache-Control', 'private, no-store');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
  reply.header('Content-Type', opened.contentType);
  reply.header('Content-Length', opened.size);
  return reply.send(opened.stream);
};

const MAX_REPORT_EVIDENCE_FILES = 5;

export const submitReportHandler = async (
  req: FastifyRequest<{ Body: { targetType: string; targetId: string; reason: string; evidenceUrls?: string[] } }>,
  reply: FastifyReply,
) => {
  const { id: reporterId } = req.user;
  const { targetType, targetId, reason, evidenceUrls } = req.body;
  // Only accept URLs our own upload endpoint produced, and only up to the cap —
  // a raw client can otherwise post an arbitrarily large/external array of "evidence".
  // Проверяем владение, а не только домен: иначе чужой файл или приватная папка reports/ уходили бы как улика
  const trustedEvidenceUrls = Array.isArray(evidenceUrls)
    ? evidenceUrls.filter((url): url is string => typeof url === 'string' && url.length > 0).slice(0, MAX_REPORT_EVIDENCE_FILES)
    : [];
  for (const url of trustedEvidenceUrls) await assertOwnedMedia(url, reporterId);
  const report = await adminService.createReport({ reporterId, targetType, targetId, reason, evidenceUrls: trustedEvidenceUrls });
  return reply.code(201).send({ success: true, data: { report }, error: null });
};

export const resolveReportHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { status: 'reviewed' | 'dismissed'; note?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const { id: resolverId } = req.user;
  const report = await adminService.resolveReport(req.params.id, resolverId, req.body.status, req.body.note);
  return reply.send({ success: true, data: { report }, error: null });
};

export const resolveReportsBatchHandler = async (
  req: FastifyRequest<{ Body: { ids: string[]; status: 'reviewed' | 'dismissed'; note?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const { id: resolverId } = req.user;
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
  if (!requireModerator(req, reply)) return;
  const { id: resolverId } = req.user;
  const { ids, targetType, targetId, deleteContent, reason, category, imageUrl } = req.body;
  if (!reason?.trim()) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_INPUT', message: 'reason is required' } });
  }
  // Same peer/higher-rank protection as the direct ban/freeze/warn endpoints — this
  // path can also ban a user (deleteContent + targetType 'user'), so it needs the
  // same guard against a moderator disciplining an equal-or-higher-ranked user.
  if (targetType === 'user' && !(await requireCanModerate(req, reply, targetId))) return;
  await adminService.resolveReportIssue({ reportIds: ids, targetType, targetId, deleteContent, reason: reason.trim(), category, imageUrl, resolverId });
  await logAdminAction(resolverId, resolverId, 'resolve_report_issue', `Решена жалоба (${targetType}) с предупреждением: ${reason.trim()}`);
  return reply.send({ success: true, data: { count: ids.length }, error: null });
};

export const getAppealsHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
  const appeals = await getPendingAppeals();
  return reply.send({ success: true, data: { appeals }, error: null });
};

export const decideAppealHandler = async (
  req: FastifyRequest<{ Params: { logId: string }; Body: { decision: 'accepted' | 'rejected' } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const actor = req.user;
  try {
    await decideAppeal(req.params.logId, actor.id, req.body.decision);
    return reply.send({ success: true, data: null, error: null });
  } catch (err) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'APPEAL_ERROR', message: errMessage(err) } });
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
  const requesterId = (req.user)?.id;
  // Placing ads is a Business-subscription perk — matches the "featAdCampaigns" pricing bullet.
  const tier = requesterId ? await userLookup.subscriptionTier(requesterId) : null;
  if (tier !== 'business') {
    return reply.code(402).send({ success: false, data: null, error: { code: 'BUSINESS_REQUIRED', message: 'Placing ads requires a Business subscription' } });
  }
  try {
    const ad = await adminService.submitAd({ ...req.body, requesterId });
    return reply.code(201).send({ success: true, data: { ad }, error: null });
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'INVALID_AD_LINK', message: errMessage(e) } });
  }
};

export const reviewAdHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { status: 'active' | 'rejected'; startsAt?: string; endsAt?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireAdmin(req, reply)) return;
  const { id: reviewerId } = req.user;
  const ad = await adminService.reviewAd(req.params.id, reviewerId, req.body.status, {
    startsAt: req.body.startsAt ? new Date(req.body.startsAt) : undefined,
    endsAt:   req.body.endsAt   ? new Date(req.body.endsAt)   : undefined,
  });
  await logAdminAction(reviewerId, ad.requester_id ?? reviewerId, req.body.status === 'active' ? 'approve_ad' : 'reject_ad', `Реклама "${ad.title}" ${req.body.status === 'active' ? 'одобрена' : 'отклонена'}`);
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
  } catch (err) {
    if (errCode(err) === 'LIMIT') return reply.status(400).send({ success: false, data: null, error: { code: 'LIMIT', message: errMessage(err) } });
    return reply.status(500).send({ success: false, data: null, error: { code: 'ERROR', message: String(err) } });
  }
};

export const updateBannerHandler = async (req: FastifyRequest<{ Params: { id: string }; Body: { is_active?: boolean } }>, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
  const banner = await adminService.updateBanner(req.params.id, req.body as any);
  if (typeof req.body?.is_active === 'boolean') {
    const actor = req.user;
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
  if (!requireModerator(req, reply)) return;
  const page = Math.max(1, parseInt(req.query.page ?? '1', 10));
  const { userId, action, category } = req.query;
  const { logs, total, pages } = await autoModLogs.list({ page, limit: 50, userId, action, category, withActor: true });
  return reply.send({ success: true, data: { logs, total, page, pages }, error: null });
};

export const unfreezeUserHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
  // Модератор не должен снимать заморозку, наложенную админом или владельцем
  if (!(await requireCanModerate(req, reply, req.params.id))) return;
  const actor = req.user;
  await moderationService.unfreeze(req.params.id, actor.id);
  return reply.send({ success: true, data: null, error: null });
};

export const freezeUserHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  if (!(await requireCanModerate(req, reply, req.params.id))) return;
  const actor = req.user;
  const reason = req.body?.reason ?? 'Заморожен вручную модератором';
  await moderationService.freeze(req.params.id, actor.id, reason);
  return reply.send({ success: true, data: null, error: null });
};

export const markDeceasedHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { note?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  if (!(await requireCanModerate(req, reply, req.params.id))) return;
  const note = req.body?.note ?? null;
  await moderationService.setDeceased(req.params.id, note);
  return reply.send({ success: true, data: null, error: null });
};

export const unmarkDeceasedHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
  if (!(await requireCanModerate(req, reply, req.params.id))) return;
  await moderationService.clearDeceased(req.params.id);
  return reply.send({ success: true, data: null, error: null });
};

export const warnUserHandler = async (
  req: FastifyRequest<{ Params: { id: string }; Body: { reason?: string; postId?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  if (!(await requireCanModerate(req, reply, req.params.id))) return;
  const actor = req.user;
  const reason = req.body?.reason?.trim() || 'Предупреждение от модератора';
  await applyAction(req.params.id, 'warn', 'manual', reason, undefined, req.body?.postId, actor.id);
  const user = await moderationService.getWarnState(req.params.id);
  return reply.send({ success: true, data: { warn_count: user?.warn_count ?? 0, frozen_at: user?.frozen_at ?? null }, error: null });
};

export const clearWarnsHandler = async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
  if (!(await requireCanModerate(req, reply, req.params.id))) return;
  const actor = req.user;
  await moderationService.clearWarns(req.params.id, actor.id);
  return reply.send({ success: true, data: null, error: null });
};

export const getInfraOverviewHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
  const data = await adminService.getInfraOverview();
  return reply.send({ success: true, data, error: null });
};

export const getGroupsOverviewHandler = async (
  req: FastifyRequest<{ Querystring: { search?: string; type?: string; sort?: string; page?: string; limit?: string; events?: string } }>,
  reply: FastifyReply,
) => {
  if (!requireModerator(req, reply)) return;
  const { search, type, sort, events } = req.query;
  const data = await adminService.getGroupsOverview({
    search: search?.trim() || undefined, type: type || undefined, sort, events,
    page: parseInt(req.query.page || '1') || 1, limit: parseInt(req.query.limit || '12') || 12,
  });
  return reply.send({ success: true, data, error: null });
};

export const getPremiumOverviewHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireModerator(req, reply)) return;
  const data = await adminService.getPremiumOverview();
  return reply.send({ success: true, data, error: null });
};

export const getFinanceReportHandler = async (req: FastifyRequest<{ Querystring: { days?: string } }>, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
  const data = await getFinanceReport(Number(req.query.days) || 30);
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

export const getStickerPackDetailHandler = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!requireAdmin(req, reply)) return;
  const data = await adminService.getStickerPackDetail((req.params as any).packId);
  if (!data) {
    return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Sticker pack not found' } });
  }
  return reply.send({ success: true, data, error: null });
};
