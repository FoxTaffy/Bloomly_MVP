import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  createFrameHandler, claimFrameHandler, updateCalibrationHandler, getMyFramesHandler,
  adminGetSubmissionsHandler, adminReviewHandler,
} from './controller.js';
import { requireAdminRole } from '../../lib/authHooks.js';

export async function avatarFramesRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  fastify.post<RouteGenericOf<typeof createFrameHandler>>('/',                  auth, createFrameHandler);
  fastify.get<RouteGenericOf<typeof getMyFramesHandler>>('/mine',                auth, getMyFramesHandler);
  fastify.post<RouteGenericOf<typeof claimFrameHandler>>('/:id/claim',          auth, claimFrameHandler);
  fastify.patch<RouteGenericOf<typeof updateCalibrationHandler>>('/:id/calibration',   auth, updateCalibrationHandler);
}

export async function avatarFramesAdminRoutes(fastify: FastifyInstance) {
  const adminOnly: RouteShorthandOptions = { onRequest: [fastify.authenticate, requireAdminRole] };

  fastify.get<RouteGenericOf<typeof adminGetSubmissionsHandler>>('/avatar-frames',              adminOnly, adminGetSubmissionsHandler);
  fastify.patch<RouteGenericOf<typeof adminReviewHandler>>('/avatar-frames/:id',        adminOnly, adminReviewHandler);
}
