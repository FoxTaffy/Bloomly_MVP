import type { FastifyRequest, FastifyReply } from 'fastify';
import { usersService } from './service.js';
import type { UpdateUserInput, UpsertFursonaInput, UpsertFursuitInput, JwtPayload } from './types.js';


export async function getUserHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const viewer = request.user as JwtPayload | undefined;
  const user = await usersService.getUserById(request.params.id, viewer?.id);

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

export async function updateUsernameHandler(
  request: FastifyRequest<{ Body: { username: string } }>,
  reply: FastifyReply,
) {
  const payload = request.user as JwtPayload;
  try {
    const { username } = request.body;
    const user = await usersService.updateUsername(payload.id, username);
    return reply.send({ success: true, data: { user }, error: null });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Update failed';
    return reply.code(409).send({ success: false, data: null, error: { code: 'USERNAME_TAKEN', message } });
  }
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
  try {
    const { id: userId } = request.user as JwtPayload;
    const data = await usersService.getNotifyStatus(userId, request.params.id);
    return reply.send({ success: true, data, error: null });
  } catch (e: any) {
    const code = e.statusCode ?? 500;
    return reply.code(code).send({ success: false, data: null, error: { code: 'NOTIFY_STATUS_ERROR', message: e.message } });
  }
}

export async function notifyToggleHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = request.user as JwtPayload;
    const data = await usersService.toggleNotifyPosts(userId, request.params.id);
    return reply.send({ success: true, data, error: null });
  } catch (e: any) {
    const code = e.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'NOTIFY_TOGGLE_ERROR', message: e.message } });
  }
}

export async function deleteAccountHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    await usersService.deleteAccount(userId);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'DELETE_ACCOUNT_ERROR', message: e.message } });
  }
}

export async function deleteAvatarHistoryHandler(
  request: FastifyRequest<{ Params: { historyId: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = request.user as JwtPayload;
    await usersService.deleteAvatarHistoryItem(userId, request.params.historyId);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    const code = e.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'HISTORY_DELETE_ERROR', message: e.message } });
  }
}

export async function restoreAvatarHistoryHandler(
  request: FastifyRequest<{ Params: { historyId: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = request.user as JwtPayload;
    const data = await usersService.restoreAvatarFromHistory(userId, request.params.historyId);
    return reply.send({ success: true, data, error: null });
  } catch (e: any) {
    const code = e.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'HISTORY_RESTORE_ERROR', message: e.message } });
  }
}

// ── Fursona handlers ──────────────────────────────────────────────────────────

export async function getFursonaHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const viewer = (request as any).user as JwtPayload | undefined;
  const fursona = await usersService.getFursona(request.params.id, viewer?.id);
  if (!fursona) {
    return reply.code(404).send({ success: false, data: null, error: { code: 'FURSONA_NOT_FOUND', message: 'Fursona not found' } });
  }
  return reply.send({ success: true, data: { fursona }, error: null });
}

export async function upsertFursonaHandler(
  request: FastifyRequest<{ Body: UpsertFursonaInput }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    const fursona = await usersService.upsertFursona(userId, request.body);
    return reply.send({ success: true, data: { fursona }, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'FURSONA_UPDATE_ERROR', message: e.message } });
  }
}

/**
 * Serve a watermarked reference image.
 * Auth required so that only logged-in users can view it.
 * The original MinIO URL is never returned to the browser.
 */
export async function getReferenceImageHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const result = await usersService.getWatermarkedReference(request.params.id);
    if (!result) {
      return reply.code(404).send({ success: false, data: null, error: { code: 'REFERENCE_NOT_FOUND', message: 'Reference image not found' } });
    }
    return reply
      .header('Content-Type', result.mimeType)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Options', 'nosniff')
      .send(result.buffer);
  } catch (e: any) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'REFERENCE_ERROR', message: e.message } });
  }
}

// ── Fursuit handlers ──────────────────────────────────────────────────────────

export async function getFursuitsHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const fursuits = await usersService.getFursuits(request.params.id);
  return reply.send({ success: true, data: { fursuits }, error: null });
}

export async function createFursuitHandler(
  request: FastifyRequest<{ Body: UpsertFursuitInput }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    const fursuit = await usersService.createFursuit(userId, request.body);
    return reply.code(201).send({ success: true, data: { fursuit }, error: null });
  } catch (e: any) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'FURSUIT_CREATE_ERROR', message: e.message } });
  }
}

export async function updateFursuitHandler(
  request: FastifyRequest<{ Params: { fursuitId: string }; Body: UpsertFursuitInput }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    const fursuit = await usersService.updateFursuit(userId, request.params.fursuitId, request.body);
    return reply.send({ success: true, data: { fursuit }, error: null });
  } catch (e: any) {
    const code = e.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'FURSUIT_UPDATE_ERROR', message: e.message } });
  }
}

export async function deleteFursuitHandler(
  request: FastifyRequest<{ Params: { fursuitId: string } }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    await usersService.deleteFursuit(userId, request.params.fursuitId);
    return reply.send({ success: true, data: null, error: null });
  } catch (e: any) {
    const code = e.statusCode ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'FURSUIT_DELETE_ERROR', message: e.message } });
  }
}
