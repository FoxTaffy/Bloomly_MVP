import { FastifyReply, FastifyRequest } from 'fastify';
import { followsService } from './service.js';

interface JwtUser { id: string; role: string }

export const toggleFollowHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: followerId } = req.user as JwtUser;
    const result = await followsService.toggle(followerId, req.params.id);
    return reply.send({ success: true, data: result, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'FOLLOW_ERROR', message: e.message } });
  }
};

export const checkFollowingHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: followerId } = req.user as JwtUser;
    const following = await followsService.isFollowing(followerId, req.params.id);
    return reply.send({ success: true, data: { following }, error: null });
  } catch (e: any) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'CHECK_ERROR', message: e.message } });
  }
};

export const checkBulkHandler = async (
  req: FastifyRequest<{ Querystring: { ids: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: followerId } = req.user as JwtUser;
    const ids = (req.query.ids || '').split(',').filter(Boolean);
    const result = await followsService.checkBulk(followerId, ids);
    return reply.send({ success: true, data: result, error: null });
  } catch (e: any) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'BULK_CHECK_ERROR', message: e.message } });
  }
};

export const getFollowersHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewer = req.user as JwtUser | undefined;
    const users = await followsService.getFollowers(req.params.id, viewer?.id);
    return reply.send({ success: true, data: { users }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ success: false, data: null, error: { code: 'FOLLOWERS_ERROR', message: e.message } });
  }
};

export const getFollowingHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewer = req.user as JwtUser | undefined;
    const users = await followsService.getFollowing(req.params.id, viewer?.id);
    return reply.send({ success: true, data: { users }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ success: false, data: null, error: { code: 'FOLLOWING_ERROR', message: e.message } });
  }
};

export const getFollowCountsHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  const counts = await followsService.getCounts(req.params.id);
  return reply.send({ success: true, data: counts, error: null });
};

export const getSubscriptionFeedHandler = async (
  req: FastifyRequest<{ Querystring: { safeMode?: string; page?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = req.user as JwtUser;
    const safeMode = req.query.safeMode === 'true';
    const page    = Math.max(1, parseInt(req.query.page ?? '1', 10) || 1);
    const posts = await followsService.getSubscriptionFeed(userId, safeMode, page);
    return reply.send({ success: true, data: { posts }, error: null });
  } catch (e: any) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'FEED_ERROR', message: e.message } });
  }
};

export const getFriendsHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewer = req.user as JwtUser | undefined;
    const users = await followsService.getFriends(req.params.id, viewer?.id);
    return reply.send({ success: true, data: { users }, error: null });
  } catch (e: any) {
    return reply.code(e.statusCode ?? 500).send({ success: false, data: null, error: { code: 'FRIENDS_ERROR', message: e.message } });
  }
};

export const getRelationStatusHandler = async (
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: viewerId } = req.user as JwtUser;
    const result = await followsService.isFriends(viewerId, req.params.id);
    return reply.send({ success: true, data: result, error: null });
  } catch (e: any) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'RELATION_ERROR', message: e.message } });
  }
};
