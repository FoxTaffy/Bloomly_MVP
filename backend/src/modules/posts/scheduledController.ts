import { FastifyReply, FastifyRequest } from 'fastify';
import { scheduledPostService } from './scheduledService.js';
import type { JwtUser } from './types.js';

type ScheduledBody = {
  content: string;
  groupId?: string;
  isNsfw?: boolean;
  isAiGenerated?: boolean;
  category?: string;
  tags?: string[];
  mediaUrls?: string[];
  mediaOriginalUrls?: string[];
  scheduledAt?: string | null;
  timezone?: string;
  repeatInterval?: 'daily' | 'weekly' | 'monthly' | null;
  repeatUntil?: string | null;
};

export const createScheduledPostHandler = async (
  request: FastifyRequest<{ Body: ScheduledBody }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const post = await scheduledPostService.create(userId, request.body);
    return reply.code(201).send({ success: true, data: { post }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to schedule post';
    const code = (error as any)?.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'SCHEDULE_POST_ERROR', message } });
  }
};

export const listScheduledPostsHandler = async (
  request: FastifyRequest<{ Querystring: { groupId?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const posts = await scheduledPostService.listMine(userId, request.query.groupId);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch scheduled posts';
    return reply.code(500).send({ success: false, data: null, error: { code: 'LIST_SCHEDULED_ERROR', message } });
  }
};

export const updateScheduledPostHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: ScheduledBody }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const post = await scheduledPostService.update(request.params.id, userId, request.body);
    return reply.send({ success: true, data: { post }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to update scheduled post';
    const code = (error as any)?.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'UPDATE_SCHEDULED_ERROR', message } });
  }
};

export const cancelScheduledPostHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    await scheduledPostService.cancel(request.params.id, userId);
    return reply.send({ success: true, data: null, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel scheduled post';
    const code = (error as any)?.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'CANCEL_SCHEDULED_ERROR', message } });
  }
};

export const publishNowScheduledPostHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const post = await scheduledPostService.publishNow(request.params.id, userId);
    return reply.send({ success: true, data: { post }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to publish post';
    const code = (error as any)?.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'PUBLISH_NOW_ERROR', message } });
  }
};
