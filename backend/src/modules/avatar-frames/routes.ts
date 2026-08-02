import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import {
  createFrameHandler, claimFrameHandler, updateCalibrationHandler, getMyFramesHandler,
  adminGetSubmissionsHandler, adminReviewHandler,
} from './controller.js';
import { isAdmin as isAdminRole } from '../../lib/roles.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

function requireAdminRole(req: FastifyRequest, reply: FastifyReply, done: () => void) {
  const user = (req as any).user;
  if (!user || !isAdminRole(user.role)) {
    reply.status(403).send({ success: false, error: 'Admin only' });
    return;
  }
  done();
}

export async function avatarFramesRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  fastify.post('/',                  auth, createFrameHandler as any);
  fastify.get('/mine',                auth, getMyFramesHandler as any);
  fastify.post('/:id/claim',          auth, claimFrameHandler as any);
  fastify.patch('/:id/calibration',   auth, updateCalibrationHandler as any);
}

export async function avatarFramesAdminRoutes(fastify: FastifyInstance) {
  const adminOnly: RouteShorthandOptions = { onRequest: [fastify.authenticate, requireAdminRole as any] };

  fastify.get('/avatar-frames',              adminOnly, adminGetSubmissionsHandler as any);
  fastify.patch('/avatar-frames/:id',        adminOnly, adminReviewHandler as any);
}
