import type { FastifyRequest, FastifyReply } from 'fastify';
import { usersService } from './service.js';
import type { UpdateUserInput, JwtPayload } from './types.js';
import prisma from '../../config/prisma.js';


export async function getUserHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const user = await usersService.getUserById(request.params.id);

  if (!user) {
    return reply.code(404).send({
      success: false,
      data: null,
      error: { code: 'USER_NOT_FOUND', message: 'User not found' },
    });
  }

  return reply.send({ success: true, data: { user }, error: null });
}

export async function updateMeHandler(
  request: FastifyRequest<{ Body: UpdateUserInput }>,
  reply: FastifyReply,
) {
  const payload = request.user as JwtPayload;
  // Never allow privileged field changes via the general update endpoint
  const { role: _role, subscription_tier: _tier, is_verified: _v, verified_at: _va, ...safeData } = request.body as any;
  const user = await usersService.updateUser(payload.id, safeData);

  return reply.send({ success: true, data: { user }, error: null });
}

export async function searchUsersHandler(
  request: FastifyRequest<{ Querystring: { q?: string } }>,
  reply: FastifyReply,
) {
  const q = (request.query as any).q ?? '';
  const users = await usersService.searchUsers(q);
  return reply.send({ success: true, data: { users }, error: null });
}

export async function getRecommendedUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const payload = request.user as JwtPayload;
  const users = await usersService.getRecommendedUsers(payload.id);
  return reply.send({ success: true, data: { users }, error: null });
}

export async function pinPostHandler(
  request: FastifyRequest<{ Params: { postId: string } }>,
  reply: FastifyReply,
) {
  try {
    const payload = request.user as JwtPayload;
    await usersService.pinPost(payload.id, request.params.postId);
    return reply.send({ success: true, data: null, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Pin failed';
    return reply.code(400).send({ success: false, data: null, error: { code: 'PIN_ERROR', message } });
  }
}

export async function unpinPostHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const payload = request.user as JwtPayload;
    await usersService.unpinPost(payload.id);
    return reply.send({ success: true, data: null, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unpin failed';
    return reply.code(400).send({ success: false, data: null, error: { code: 'UNPIN_ERROR', message } });
  }
}

export async function getMediaHistoryHandler(
  request: FastifyRequest<{ Params: { id: string }; Querystring: { type?: string } }>,
  reply: FastifyReply,
) {
  const { id } = request.params;
  const type = request.query.type as 'avatar' | 'banner' | undefined;
  const history = await usersService.getMediaHistory(id, type);
  return reply.send({ success: true, data: { history }, error: null });
}

export async function blockUserHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtPayload;
    await usersService.blockUser(userId, req.params.id);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'BLOCK_ERROR', message: e.message } });
  }
}

export async function unblockUserHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtPayload;
    await usersService.unblockUser(userId, req.params.id);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'UNBLOCK_ERROR', message: e.message } });
  }
}

export async function getBlockStatusHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = req.user as JwtPayload;
    const data = await usersService.getBlockStatus(userId, req.params.id);
    return reply.send({ success: true, data, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'BLOCK_ERROR', message: e.message } });
  }
}

export async function setPublicKeyHandler(
  request: FastifyRequest<{ Body: { public_key: string } }>,
  reply: FastifyReply,
) {
  const payload = request.user as JwtPayload;
  await usersService.setPublicKey(payload.id, (request.body as any).public_key);
  return reply.send({ success: true, data: null, error: null });
}

export async function getPublicKeyHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const key = await usersService.getPublicKey(request.params.id);
  return reply.send({ success: true, data: { public_key: key }, error: null });
}

export async function updateSubscriptionHandler(
  request: FastifyRequest<{ Body: { tier: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = request.user as JwtPayload;
    const { tier } = request.body;
    const data = await usersService.updateSubscriptionTier(userId, tier);
    return reply.send({ success: true, data, error: null });
  } catch (e: any) {
    const code = e.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'SUBSCRIPTION_ERROR', message: e.message } });
  }
}

export async function notifyStatusHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  const targetId = request.params.id;
  const follow = await prisma.follow.findUnique({
    where: { follower_id_following_id: { follower_id: userId, following_id: targetId } },
  });
  return reply.send({
    success: true,
    data: { following: !!follow, notifyPosts: follow?.notify_posts ?? false },
    error: null,
  });
}

export async function notifyToggleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  const targetId = request.params.id;
  const follow = await prisma.follow.findUnique({
    where: { follower_id_following_id: { follower_id: userId, following_id: targetId } },
  });
  if (!follow) {
    return reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOLLOWING', message: 'Not following this user' } });
  }
  const updated = await prisma.follow.update({
    where: { id: follow.id },
    data: { notify_posts: !follow.notify_posts },
  });
  return reply.send({ success: true, data: { notifyPosts: updated.notify_posts }, error: null });
}
