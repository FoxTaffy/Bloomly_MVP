import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  getStatsHandler, getUsersHandler, updateUserRoleHandler, getSponsorsHandler, updateUserSponsorHandler, updateUserSubscriptionHandler, updateUserProfileHandler, deleteUserHandler,
  getArchivedUsersHandler, getFrozenUsersHandler, restoreUserHandler,
  getPostsAdminHandler, deletePostAdminHandler,
  getReportsHandler, getReportEvidenceHandler, submitReportHandler, resolveReportHandler, resolveReportsBatchHandler, resolveReportIssueHandler,
  getAppealsHandler, decideAppealHandler,
  getAdsHandler, getActiveAdsHandler, submitAdHandler, getAdPricingHandler, reviewAdHandler, deleteAdHandler,
  trackImpressionHandler, trackClickHandler,
  getBannersHandler, getActiveBannersHandler, createBannerHandler, updateBannerHandler, deleteBannerHandler,
  getAutoModLogsHandler, unfreezeUserHandler, freezeUserHandler, clearWarnsHandler, warnUserHandler,
  markDeceasedHandler, unmarkDeceasedHandler,
  getStickerStatsHandler, getNetworkStatsHandler, getStickerPackDetailHandler, togglePostPinHandler,
  getGroupsOverviewHandler, getPremiumOverviewHandler, getFinanceReportHandler, getInfraOverviewHandler,
  getStaffHandler, promoteToStaffHandler,
  sendBroadcastHandler, getBroadcastsHandler,
  getSettingsHandler, updateSettingHandler,
} from './controller.js';
import {
  shopOverviewHandler, shopTypeStatsHandler, shopItemsHandler, shopCreateItemHandler, shopUpdateItemHandler, shopDeleteItemHandler,
  shopPacksHandler, shopPackStatusHandler, shopAccessRequestsHandler,
  denOverviewHandler, denListingsHandler, denListingStatusHandler, denListingDeleteHandler,
  denDisputesHandler, denFairsHandler, denFairStatusHandler, denGroupsHandler, denGroupDisconnectHandler,
} from './market.controller.js';
import { requireAdmin } from '../../lib/authHooks.js';
import { onlineService } from './online.service.js';

export async function adminRoutes(fastify: FastifyInstance) {
  // Explicitly typed to avoid @fastify/websocket overload ambiguity
  // Общий массив onRequest: плагин лимитов дописывает свои хуки в routeOptions.onRequest, поэтому маршруты с config.rateLimit берут свой массив
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // Bloomly Shop (admin+)
  fastify.get<RouteGenericOf<typeof shopOverviewHandler>>('/shop/overview', auth, shopOverviewHandler);
  fastify.get<RouteGenericOf<typeof shopTypeStatsHandler>>('/shop/stats/:type', auth, shopTypeStatsHandler);
  fastify.get<RouteGenericOf<typeof shopItemsHandler>>('/shop/items', auth, shopItemsHandler);
  fastify.post<RouteGenericOf<typeof shopCreateItemHandler>>('/shop/items', auth, shopCreateItemHandler);
  fastify.patch<RouteGenericOf<typeof shopUpdateItemHandler>>('/shop/items/:id', auth, shopUpdateItemHandler);
  fastify.delete<RouteGenericOf<typeof shopDeleteItemHandler>>('/shop/items/:id', auth, shopDeleteItemHandler);
  fastify.get<RouteGenericOf<typeof shopPacksHandler>>('/shop/packs', auth, shopPacksHandler);
  fastify.patch<RouteGenericOf<typeof shopPackStatusHandler>>('/shop/packs/:id/status', auth, shopPackStatusHandler);
  fastify.get<RouteGenericOf<typeof shopAccessRequestsHandler>>('/shop/access-requests', auth, shopAccessRequestsHandler);

  // Dealers' Den (admin+); споры, ярмарки (создание, участники) и рамки — в своих модулях
  fastify.get<RouteGenericOf<typeof denOverviewHandler>>('/den/overview', auth, denOverviewHandler);
  fastify.get<RouteGenericOf<typeof denListingsHandler>>('/den/listings', auth, denListingsHandler);
  fastify.patch<RouteGenericOf<typeof denListingStatusHandler>>('/den/listings/:id/status', auth, denListingStatusHandler);
  fastify.delete<RouteGenericOf<typeof denListingDeleteHandler>>('/den/listings/:id', auth, denListingDeleteHandler);
  fastify.get<RouteGenericOf<typeof denDisputesHandler>>('/den/disputes', auth, denDisputesHandler);
  fastify.get<RouteGenericOf<typeof denFairsHandler>>('/den/fairs', auth, denFairsHandler);
  fastify.patch<RouteGenericOf<typeof denFairStatusHandler>>('/den/fairs/:id/status', auth, denFairStatusHandler);
  fastify.get<RouteGenericOf<typeof denGroupsHandler>>('/den/groups', auth, denGroupsHandler);
  fastify.post<RouteGenericOf<typeof denGroupDisconnectHandler>>('/den/groups/:id/disconnect', auth, denGroupDisconnectHandler);

  // Stats
  fastify.get<RouteGenericOf<typeof getStatsHandler>>('/stats', auth, getStatsHandler);

  // Team & roles
  fastify.get<RouteGenericOf<typeof getStaffHandler>>('/staff',    auth, getStaffHandler);
  fastify.post<RouteGenericOf<typeof promoteToStaffHandler>>('/staff',  auth, promoteToStaffHandler);

  // Broadcasts
  fastify.get<RouteGenericOf<typeof getBroadcastsHandler>>('/broadcasts',  auth, getBroadcastsHandler);
  fastify.post<RouteGenericOf<typeof sendBroadcastHandler>>('/broadcasts', auth, sendBroadcastHandler);

  // Site settings
  fastify.get<RouteGenericOf<typeof getSettingsHandler>>('/settings',   auth, getSettingsHandler);
  fastify.patch<RouteGenericOf<typeof updateSettingHandler>>('/settings', auth, updateSettingHandler);

  // Users
  fastify.get<RouteGenericOf<typeof getUsersHandler>>('/users',            auth, getUsersHandler);
  fastify.get<RouteGenericOf<typeof getArchivedUsersHandler>>('/users/archived',   auth, getArchivedUsersHandler);
  fastify.get<RouteGenericOf<typeof getFrozenUsersHandler>>('/users/frozen',     auth, getFrozenUsersHandler);
  fastify.patch<RouteGenericOf<typeof updateUserRoleHandler>>('/users/:id/role', auth, updateUserRoleHandler);
  fastify.get<RouteGenericOf<typeof getSponsorsHandler>>('/users/sponsors', auth, getSponsorsHandler);
  fastify.patch<RouteGenericOf<typeof updateUserSponsorHandler>>('/users/:id/sponsor', auth, updateUserSponsorHandler);
  fastify.patch<RouteGenericOf<typeof updateUserSubscriptionHandler>>('/users/:id/subscription', auth, updateUserSubscriptionHandler);
  fastify.patch<RouteGenericOf<typeof updateUserProfileHandler>>('/users/:id/profile', {
    schema: {
      body: {
        type: 'object',
        properties: {
          username:     { type: 'string', minLength: 3, maxLength: 30, pattern: '^[a-z0-9_]+$' },
          display_name: { type: 'string', maxLength: 50 },
          bio:          { type: 'string', maxLength: 300 },
          status:       { type: 'string', maxLength: 100 },
          pronouns:     { type: 'string', maxLength: 30 },
          location:     { type: 'string', maxLength: 100 },
          website:      { type: 'string', maxLength: 200 },
          job_title:    { type: 'string', maxLength: 80 },
          country:      { type: 'string', maxLength: 80 },
        },
        additionalProperties: false,
      },
    },
    onRequest: [fastify.authenticate],
  }, updateUserProfileHandler);
  fastify.delete<RouteGenericOf<typeof deleteUserHandler>>('/users/:id',     auth, deleteUserHandler);
  fastify.post<RouteGenericOf<typeof restoreUserHandler>>('/users/:id/restore', auth, restoreUserHandler);
  fastify.post<RouteGenericOf<typeof markDeceasedHandler>>('/users/:id/deceased',   auth, markDeceasedHandler);
  fastify.post<RouteGenericOf<typeof unmarkDeceasedHandler>>('/users/:id/undeceased', auth, unmarkDeceasedHandler);

  // Posts
  fastify.get<RouteGenericOf<typeof getPostsAdminHandler>>('/posts',           auth, getPostsAdminHandler);
  fastify.delete<RouteGenericOf<typeof deletePostAdminHandler>>('/posts/:id',    auth, deletePostAdminHandler);
  fastify.patch<RouteGenericOf<typeof togglePostPinHandler>>('/posts/:id/pin', auth, togglePostPinHandler);

  // Reports
  fastify.get<RouteGenericOf<typeof getReportsHandler>>('/reports',        auth, getReportsHandler);
  fastify.get<RouteGenericOf<typeof getReportEvidenceHandler>>('/reports/evidence', auth, getReportEvidenceHandler);
  fastify.post<RouteGenericOf<typeof submitReportHandler>>('/reports',       { onRequest: [fastify.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } } as RouteShorthandOptions, submitReportHandler);
  fastify.patch<RouteGenericOf<typeof resolveReportHandler>>('/reports/:id',  auth, resolveReportHandler);
  fastify.patch<RouteGenericOf<typeof resolveReportsBatchHandler>>('/reports/resolve-batch', auth, resolveReportsBatchHandler);
  fastify.patch<RouteGenericOf<typeof resolveReportIssueHandler>>('/reports/resolve-issue', auth, resolveReportIssueHandler);

  // Warning appeals
  fastify.get<RouteGenericOf<typeof getAppealsHandler>>('/appeals',        auth, getAppealsHandler);
  fastify.patch<RouteGenericOf<typeof decideAppealHandler>>('/appeals/:logId', auth, decideAppealHandler);

  // Ads
  fastify.get<RouteGenericOf<typeof getAdsHandler>>('/ads',              auth, getAdsHandler);
  fastify.get<RouteGenericOf<typeof getActiveAdsHandler>>('/ads/active',       getActiveAdsHandler);
  fastify.get('/ads/pricing', auth, getAdPricingHandler);
  fastify.post<RouteGenericOf<typeof submitAdHandler>>('/ads',             { onRequest: [fastify.authenticate], config: { rateLimit: { max: 5, timeWindow: '1 hour' } } } as RouteShorthandOptions, submitAdHandler);
  fastify.patch<RouteGenericOf<typeof reviewAdHandler>>('/ads/:id/review', auth, reviewAdHandler);
  fastify.delete<RouteGenericOf<typeof deleteAdHandler>>('/ads/:id',       auth, deleteAdHandler);
  fastify.post<RouteGenericOf<typeof trackImpressionHandler>>('/ads/:id/impression', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, trackImpressionHandler);
  fastify.post<RouteGenericOf<typeof trackClickHandler>>('/ads/:id/click',      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, trackClickHandler);

  // Sticker Banners
  fastify.get<RouteGenericOf<typeof getBannersHandler>>('/sticker-banners',        auth, getBannersHandler);   // admin: all
  fastify.get<RouteGenericOf<typeof getActiveBannersHandler>>('/sticker-banners/active', getActiveBannersHandler);   // public
  fastify.post<RouteGenericOf<typeof createBannerHandler>>('/sticker-banners',       auth, createBannerHandler);
  fastify.patch<RouteGenericOf<typeof updateBannerHandler>>('/sticker-banners/:id',  auth, updateBannerHandler);
  fastify.delete<RouteGenericOf<typeof deleteBannerHandler>>('/sticker-banners/:id', auth, deleteBannerHandler);

  // AutoMod
  fastify.get<RouteGenericOf<typeof getAutoModLogsHandler>>('/automod/logs',              auth, getAutoModLogsHandler);
  fastify.post<RouteGenericOf<typeof unfreezeUserHandler>>('/users/:id/unfreeze',       auth, unfreezeUserHandler);
  fastify.post<RouteGenericOf<typeof freezeUserHandler>>('/users/:id/freeze',         auth, freezeUserHandler);
  fastify.post<RouteGenericOf<typeof clearWarnsHandler>>('/users/:id/clear-warns',    auth, clearWarnsHandler);
  fastify.post<RouteGenericOf<typeof warnUserHandler>>('/users/:id/warn',           auth, warnUserHandler);

  // Statistics
  fastify.get<RouteGenericOf<typeof getStickerStatsHandler>>('/stats/stickers', auth, getStickerStatsHandler);
  fastify.get<RouteGenericOf<typeof getStickerPackDetailHandler>>('/stats/stickers/:packId', auth, getStickerPackDetailHandler);
  fastify.get<RouteGenericOf<typeof getNetworkStatsHandler>>('/stats/network',  auth, getNetworkStatsHandler);

  // Groups & events / premium / infra overview
  fastify.get<RouteGenericOf<typeof getGroupsOverviewHandler>>('/groups-overview',  auth, getGroupsOverviewHandler);
  fastify.get<RouteGenericOf<typeof getPremiumOverviewHandler>>('/premium-overview', auth, getPremiumOverviewHandler);
  fastify.get<RouteGenericOf<typeof getFinanceReportHandler>>('/finance', { onRequest: [fastify.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } } as RouteShorthandOptions, getFinanceReportHandler);
  fastify.get<RouteGenericOf<typeof getInfraOverviewHandler>>('/infra-overview',   auth, getInfraOverviewHandler);

  // Онлайн в реальном времени и суточная аналитика активности (admin+)
  fastify.get('/online/live', auth, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return reply.send({ success: true, data: await onlineService.live(), error: null });
  });
  fastify.get<{ Querystring: { tz?: string } }>('/online/daily', auth, async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return reply.send({ success: true, data: await onlineService.daily(req.query.tz), error: null });
  });
}
