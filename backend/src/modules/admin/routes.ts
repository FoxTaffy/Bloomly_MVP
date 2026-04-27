import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  getStatsHandler, getUsersHandler, updateUserRoleHandler, deleteUserHandler,
  getArchivedUsersHandler, restoreUserHandler,
  getPostsAdminHandler, deletePostAdminHandler,
  getReportsHandler, submitReportHandler, resolveReportHandler,
  getAdsHandler, getActiveAdsHandler, submitAdHandler, reviewAdHandler,
  trackImpressionHandler, trackClickHandler,
  getBannersHandler, getActiveBannersHandler, createBannerHandler, updateBannerHandler, deleteBannerHandler,
  getAutoModLogsHandler, unfreezeUserHandler, freezeUserHandler, clearWarnsHandler,
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

  // Users
  fastify.get('/users',            auth, getUsersHandler as any);
  fastify.get('/users/archived',   auth, getArchivedUsersHandler as any);
  fastify.patch('/users/:id/role', auth, updateUserRoleHandler as any);
  fastify.delete('/users/:id',     auth, deleteUserHandler as any);
  fastify.post('/users/:id/restore', auth, restoreUserHandler as any);

  // Posts
  fastify.get('/posts',         auth, getPostsAdminHandler as any);
  fastify.delete('/posts/:id',  auth, deletePostAdminHandler as any);

  // Reports
  fastify.get('/reports',        auth, getReportsHandler as any);
  fastify.post('/reports',       { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } } as RouteShorthandOptions, submitReportHandler as any);
  fastify.patch('/reports/:id',  auth, resolveReportHandler as any);

  // Ads
  fastify.get('/ads',              auth, getAdsHandler as any);
  fastify.get('/ads/active',       getActiveAdsHandler as any);
  fastify.post('/ads',             { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 hour' } } } as RouteShorthandOptions, submitAdHandler as any);
  fastify.patch('/ads/:id/review', auth, reviewAdHandler as any);
  fastify.post('/ads/:id/impression', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, trackImpressionHandler as any);
  fastify.post('/ads/:id/click',      { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, trackClickHandler as any);

  // Sticker Banners
  fastify.get('/sticker-banners',        getBannersHandler as any);          // admin: all
  fastify.get('/sticker-banners/active', getActiveBannersHandler as any);   // public
  fastify.post('/sticker-banners',       auth, createBannerHandler as any);
  fastify.patch('/sticker-banners/:id',  auth, updateBannerHandler as any);
  fastify.delete('/sticker-banners/:id', auth, deleteBannerHandler as any);

  // AutoMod
  fastify.get('/automod/logs',              auth, getAutoModLogsHandler as any);
  fastify.post('/users/:id/unfreeze',       auth, unfreezeUserHandler as any);
  fastify.post('/users/:id/freeze',         auth, freezeUserHandler as any);
  fastify.post('/users/:id/clear-warns',    auth, clearWarnsHandler as any);
}
