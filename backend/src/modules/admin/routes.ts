import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getStatsHandler, getUsersHandler, updateUserRoleHandler, deleteUserHandler,
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
  // Stats
  fastify.get('/stats', { onRequest: [fastify.authenticate] }, getStatsHandler);

  // Users
  fastify.get('/users',           { onRequest: [fastify.authenticate] }, getUsersHandler);
  fastify.patch('/users/:id/role',{ onRequest: [fastify.authenticate] }, updateUserRoleHandler);
  fastify.delete('/users/:id',    { onRequest: [fastify.authenticate] }, deleteUserHandler);

  // Posts
  fastify.get('/posts',         { onRequest: [fastify.authenticate] }, getPostsAdminHandler);
  fastify.delete('/posts/:id',  { onRequest: [fastify.authenticate] }, deletePostAdminHandler);

  // Reports
  fastify.get('/reports',           { onRequest: [fastify.authenticate] }, getReportsHandler);
  fastify.post('/reports',          { onRequest: [fastify.authenticate] }, submitReportHandler);
  fastify.patch('/reports/:id',     { onRequest: [fastify.authenticate] }, resolveReportHandler);

  // Ads
  fastify.get('/ads',              { onRequest: [fastify.authenticate] }, getAdsHandler);
  fastify.get('/ads/active',       getActiveAdsHandler);
  fastify.post('/ads',             submitAdHandler);
  fastify.patch('/ads/:id/review', { onRequest: [fastify.authenticate] }, reviewAdHandler);
  fastify.post('/ads/:id/impression', trackImpressionHandler);
  fastify.post('/ads/:id/click',      trackClickHandler);
}
