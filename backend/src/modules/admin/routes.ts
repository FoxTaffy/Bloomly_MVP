import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  getStatsHandler, getUsersHandler, updateUserRoleHandler, deleteUserHandler,
  getArchivedUsersHandler, restoreUserHandler,
  getPostsAdminHandler, deletePostAdminHandler,
  getReportsHandler, submitReportHandler, resolveReportHandler,
  getAdsHandler, getActiveAdsHandler, submitAdHandler, reviewAdHandler,
  trackImpressionHandler, trackClickHandler,
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
  fastify.post('/reports',       auth, submitReportHandler as any);
  fastify.patch('/reports/:id',  auth, resolveReportHandler as any);

  // Ads
  fastify.get('/ads',              auth, getAdsHandler as any);
  fastify.get('/ads/active',       getActiveAdsHandler as any);
  fastify.post('/ads',             submitAdHandler as any);
  fastify.patch('/ads/:id/review', auth, reviewAdHandler as any);
  fastify.post('/ads/:id/impression', trackImpressionHandler as any);
  fastify.post('/ads/:id/click',      trackClickHandler as any);
}
