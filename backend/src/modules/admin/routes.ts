import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  getStatsHandler, getUsersHandler, updateUserRoleHandler, updateUserSubscriptionHandler, deleteUserHandler,
  getArchivedUsersHandler, getFrozenUsersHandler, restoreUserHandler,
  getPostsAdminHandler, deletePostAdminHandler,
  getReportsHandler, submitReportHandler, resolveReportHandler, resolveReportsBatchHandler, resolveReportIssueHandler,
  getAppealsHandler, decideAppealHandler,
  getAdsHandler, getActiveAdsHandler, submitAdHandler, reviewAdHandler, deleteAdHandler,
  trackImpressionHandler, trackClickHandler,
  getBannersHandler, getActiveBannersHandler, createBannerHandler, updateBannerHandler, deleteBannerHandler,
  getAutoModLogsHandler, unfreezeUserHandler, freezeUserHandler, clearWarnsHandler, warnUserHandler,
  markDeceasedHandler, unmarkDeceasedHandler,
  getStickerStatsHandler, getNetworkStatsHandler, getStickerPackDetailHandler, togglePostPinHandler,
  getGroupsOverviewHandler, getPremiumOverviewHandler, getInfraOverviewHandler,
  getStaffHandler, promoteToStaffHandler,
  sendBroadcastHandler, getBroadcastsHandler,
  getSettingsHandler, updateSettingHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function adminRoutes(fastify: FastifyInstance) {
  // Explicitly typed to avoid @fastify/websocket overload ambiguity
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // Stats
  fastify.get('/stats', auth, getStatsHandler as any);

  // Team & roles
  fastify.get('/staff',    auth, getStaffHandler as any);
  fastify.post('/staff',  auth, promoteToStaffHandler as any);

  // Broadcasts
  fastify.get('/broadcasts',  auth, getBroadcastsHandler as any);
  fastify.post('/broadcasts', auth, sendBroadcastHandler as any);

  // Site settings
  fastify.get('/settings',   auth, getSettingsHandler as any);
  fastify.patch('/settings', auth, updateSettingHandler as any);

  // Users
  fastify.get('/users',            auth, getUsersHandler as any);
  fastify.get('/users/archived',   auth, getArchivedUsersHandler as any);
  fastify.get('/users/frozen',     auth, getFrozenUsersHandler as any);
  fastify.patch('/users/:id/role', auth, updateUserRoleHandler as any);
  fastify.patch('/users/:id/subscription', auth, updateUserSubscriptionHandler as any);
  fastify.delete('/users/:id',     auth, deleteUserHandler as any);
  fastify.post('/users/:id/restore', auth, restoreUserHandler as any);
  fastify.post('/users/:id/deceased',   auth, markDeceasedHandler as any);
  fastify.post('/users/:id/undeceased', auth, unmarkDeceasedHandler as any);

  // Posts
  fastify.get('/posts',           auth, getPostsAdminHandler as any);
  fastify.delete('/posts/:id',    auth, deletePostAdminHandler as any);
  fastify.patch('/posts/:id/pin', auth, togglePostPinHandler as any);

  // Reports
  fastify.get('/reports',        auth, getReportsHandler as any);
  fastify.post('/reports',       { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } } as RouteShorthandOptions, submitReportHandler as any);
  fastify.patch('/reports/:id',  auth, resolveReportHandler as any);
  fastify.patch('/reports/resolve-batch', auth, resolveReportsBatchHandler as any);
  fastify.patch('/reports/resolve-issue', auth, resolveReportIssueHandler as any);

  // Warning appeals
  fastify.get('/appeals',        auth, getAppealsHandler as any);
  fastify.patch('/appeals/:logId', auth, decideAppealHandler as any);

  // Ads
  fastify.get('/ads',              auth, getAdsHandler as any);
  fastify.get('/ads/active',       getActiveAdsHandler as any);
  fastify.post('/ads',             { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } } as RouteShorthandOptions, submitAdHandler as any);
  fastify.patch('/ads/:id/review', auth, reviewAdHandler as any);
  fastify.delete('/ads/:id',       auth, deleteAdHandler as any);
  fastify.post('/ads/:id/impression', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, trackImpressionHandler as any);
  fastify.post('/ads/:id/click',      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, trackClickHandler as any);

  // Sticker Banners
  fastify.get('/sticker-banners',        auth, getBannersHandler as any);   // admin: all
  fastify.get('/sticker-banners/active', getActiveBannersHandler as any);   // public
  fastify.post('/sticker-banners',       auth, createBannerHandler as any);
  fastify.patch('/sticker-banners/:id',  auth, updateBannerHandler as any);
  fastify.delete('/sticker-banners/:id', auth, deleteBannerHandler as any);

  // AutoMod
  fastify.get('/automod/logs',              auth, getAutoModLogsHandler as any);
  fastify.post('/users/:id/unfreeze',       auth, unfreezeUserHandler as any);
  fastify.post('/users/:id/freeze',         auth, freezeUserHandler as any);
  fastify.post('/users/:id/clear-warns',    auth, clearWarnsHandler as any);
  fastify.post('/users/:id/warn',           auth, warnUserHandler as any);

  // Statistics
  fastify.get('/stats/stickers', auth, getStickerStatsHandler as any);
  fastify.get('/stats/stickers/:packId', auth, getStickerPackDetailHandler as any);
  fastify.get('/stats/network',  auth, getNetworkStatsHandler as any);

  // Groups & events / premium / infra overview
  fastify.get('/groups-overview',  auth, getGroupsOverviewHandler as any);
  fastify.get('/premium-overview', auth, getPremiumOverviewHandler as any);
  fastify.get('/infra-overview',   auth, getInfraOverviewHandler as any);
}
