import { FastifyReply, FastifyRequest } from 'fastify';
import { analyticsService } from './service.js';
import type { JwtPayload } from '../auth/types.js';

export const trackActivityHandler = async (
  request: FastifyRequest<{ Body: { postId: string; type: string; duration?: number } }>,
  reply: FastifyReply,
) => {
  // Fire-and-forget: always return 200 so client errors are silent
  const { id: userId } = request.user as JwtPayload;
  const { postId, type, duration } = request.body;
  analyticsService.trackActivity({ userId, postId, type, duration }).catch(() => {});
  return reply.send({ success: true, data: null, error: null });
};
