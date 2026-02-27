import type { FastifyRequest, FastifyReply } from 'fastify';
import { usersService } from './service.js';
import type { UpdateUserInput, JwtPayload } from './types.js';


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
  // Never allow role changes via the general update endpoint
  const { role: _role, ...safeData } = request.body as any;
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

export async function toggleAdModeHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const payload = request.user as JwtPayload;
    // Admins/moderators cannot downgrade themselves to advertiser
    if (payload.role === 'admin' || payload.role === 'moderator') {
      return reply.code(403).send({ success: false, data: null, error: { code: 'FORBIDDEN', message: 'Cannot change role of privileged accounts' } });
    }
    const result = await usersService.toggleAdMode(payload.id);
    return reply.send({ success: true, data: result, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Toggle AD mode failed';
    return reply.code(400).send({ success: false, data: null, error: { code: 'AD_TOGGLE_ERROR', message } });
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
