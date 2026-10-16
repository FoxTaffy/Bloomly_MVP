import type { FastifyRequest, FastifyReply } from 'fastify';
import { usersService, withRedactedBirthDate } from './service.js';
import { isAdult } from '../../lib/age.js';
import type { UpdateUserInput, UpsertFursonaInput, UpsertFursuitInput, UpsertReferenceImageInput, JwtPayload } from './types.js';
import { isDevEnv } from '../../lib/env.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';


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

  return reply.send({ success: true, data: { user: { ...user, is_adult: isAdult(user.birth_date) } }, error: null });
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
  request: FastifyRequest<{ Querystring: { q?: string; limit?: string; page?: string } }>,
  reply: FastifyReply,
) {
  const { q = '', limit, page } = request.query as any;
  const users = (await usersService.searchUsers(q, limit ? parseInt(limit, 10) : 8, page ? parseInt(page, 10) : 1))
    .map(withRedactedBirthDate);
  return reply.send({ success: true, data: { users }, error: null });
}

export async function getRecommendedUsersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const payload = request.user as JwtPayload;
  const users = (await usersService.getRecommendedUsers(payload.id)).map(withRedactedBirthDate);
  return reply.send({ success: true, data: { users }, error: null });
}

export async function proxyMusicMediaHandler(
  request: FastifyRequest<{ Querystring: { url?: string } }>,
  reply: FastifyReply,
) {
  const { url } = request.query as any;
  if (!url) return reply.code(400).send();
  try {
    const { contentType, buffer } = await usersService.fetchMusicMedia(url);
    return reply
      .header('Content-Type', contentType)
      .header('Cache-Control', 'public, max-age=86400, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .send(buffer);
  } catch (e) {
    return reply.code(errStatus(e) ?? 502).send();
  }
}

export async function searchMusicHandler(
  request: FastifyRequest<{ Querystring: { q?: string } }>,
  reply: FastifyReply,
) {
  const { q = '' } = request.query as any;
  if (!q.trim()) return reply.send({ success: true, data: { tracks: [] }, error: null });

  try {
    const tracks = await usersService.searchMusic(q);
    return reply.send({ success: true, data: { tracks }, error: null });
  } catch {
    return reply.code(502).send({ success: false, data: null, error: { code: 'MUSIC_SEARCH_FAILED', message: 'Music search is unavailable' } });
  }
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
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'BLOCK_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'UNBLOCK_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'BLOCK_ERROR', message: errMessage(e) } });
  }
}

export async function setPublicKeyHandler(
  request: FastifyRequest<{ Body: { public_key: string } }>,
  reply: FastifyReply,
) {
  const payload = request.user as JwtPayload;
  await usersService.setPublicKey(payload.id, request.body.public_key);
  return reply.send({ success: true, data: null, error: null });
}

export async function getPublicKeyHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const key = await usersService.getPublicKey(request.params.id);
  return reply.send({ success: true, data: { public_key: key }, error: null });
}

export async function getProfileStatsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = request.user as JwtPayload;
    const stats = await usersService.getProfileStats(userId);
    return reply.send({ success: true, data: { stats }, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 500;
    return reply.code(code).send({ success: false, data: null, error: { code: 'PROFILE_STATS_ERROR', message: errMessage(e) } });
  }
}

export async function updateSubscriptionHandler(
  request: FastifyRequest<{ Body: { tier: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = request.user as JwtPayload;
    const { tier } = request.body;
    // Платный тариф без процессора оплаты выдавался по любой сохранённой «карте».
    // В production смена на платный тариф — только через админа, пока нет реальной оплаты.
    if (!isDevEnv() && tier !== 'free') {
      return reply.code(403).send({ success: false, data: null, error: { code: 'PAYMENT_NOT_AVAILABLE', message: 'Оплата подписки пока недоступна' } });
    }
    const data = await usersService.updateSubscriptionTier(userId, tier);
    return reply.send({ success: true, data, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'SUBSCRIPTION_ERROR', message: errMessage(e) } });
  }
}

export async function listPaymentMethodsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  const data = await usersService.listPaymentMethods(userId);
  return reply.send({ success: true, data, error: null });
}

export async function addPaymentMethodHandler(
  request: FastifyRequest<{ Body: { cardNumber: string; expMonth: number; expYear: number; holderName: string; setDefault?: boolean } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = request.user as JwtPayload;
    const data = await usersService.addPaymentMethod(userId, request.body);
    return reply.send({ success: true, data, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'PAYMENT_METHOD_ERROR', message: errMessage(e) } });
  }
}

export async function deletePaymentMethodHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = request.user as JwtPayload;
    const data = await usersService.deletePaymentMethod(userId, request.params.id);
    return reply.send({ success: true, data, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'PAYMENT_METHOD_ERROR', message: errMessage(e) } });
  }
}

export async function setDefaultPaymentMethodHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const { id: userId } = request.user as JwtPayload;
    const data = await usersService.setDefaultPaymentMethod(userId, request.params.id);
    return reply.send({ success: true, data, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'PAYMENT_METHOD_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    const code = errStatus(e) ?? 500;
    return reply.code(code).send({ success: false, data: null, error: { code: 'NOTIFY_STATUS_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'NOTIFY_TOGGLE_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'DELETE_ACCOUNT_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'HISTORY_DELETE_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'HISTORY_RESTORE_ERROR', message: errMessage(e) } });
  }
}

// ── Fursona handlers (1:N per user) ─────────────────────────────────────────

export async function getFursonasHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const viewer = request.user as JwtPayload | undefined;
  const fursonas = await usersService.getFursonas(request.params.id, viewer?.id);
  return reply.send({ success: true, data: { fursonas }, error: null });
}

export async function createFursonaHandler(
  request: FastifyRequest<{ Body: UpsertFursonaInput }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    const fursona = await usersService.createFursona(userId, request.body);
    return reply.code(201).send({ success: true, data: { fursona }, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'FURSONA_CREATE_ERROR', message: errMessage(e) } });
  }
}

export async function updateFursonaHandler(
  request: FastifyRequest<{ Params: { fursonaId: string }; Body: UpsertFursonaInput }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    const fursona = await usersService.updateFursona(userId, request.params.fursonaId, request.body);
    return reply.send({ success: true, data: { fursona }, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'FURSONA_UPDATE_ERROR', message: errMessage(e) } });
  }
}

export async function deleteFursonaHandler(
  request: FastifyRequest<{ Params: { fursonaId: string } }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    const result = await usersService.deleteFursona(userId, request.params.fursonaId);
    return reply.send({ success: true, data: result, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'FURSONA_DELETE_ERROR', message: errMessage(e) } });
  }
}

export async function setPrimaryFursonaHandler(
  request: FastifyRequest<{ Params: { fursonaId: string } }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    const result = await usersService.setPrimaryFursona(userId, request.params.fursonaId);
    return reply.send({ success: true, data: result, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'FURSONA_PRIMARY_ERROR', message: errMessage(e) } });
  }
}

// ── Fursona reference gallery handlers (1:N per Fursona) ─────────────────────

export async function getReferenceImagesHandler(
  request: FastifyRequest<{ Params: { id: string; fursonaId: string } }>,
  reply: FastifyReply,
) {
  const referenceImages = await usersService.getReferenceImages(request.params.id, request.params.fursonaId);
  return reply.send({ success: true, data: { referenceImages }, error: null });
}

export async function addReferenceImageHandler(
  request: FastifyRequest<{ Params: { fursonaId: string }; Body: UpsertReferenceImageInput }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    const referenceImage = await usersService.addReferenceImage(userId, request.params.fursonaId, request.body);
    return reply.code(201).send({ success: true, data: { referenceImage }, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'REFERENCE_CREATE_ERROR', message: errMessage(e) } });
  }
}

export async function updateReferenceImageHandler(
  request: FastifyRequest<{ Params: { fursonaId: string; refId: string }; Body: UpsertReferenceImageInput }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    const referenceImage = await usersService.updateReferenceImage(userId, request.params.fursonaId, request.params.refId, request.body);
    return reply.send({ success: true, data: { referenceImage }, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'REFERENCE_UPDATE_ERROR', message: errMessage(e) } });
  }
}

export async function deleteReferenceImageHandler(
  request: FastifyRequest<{ Params: { fursonaId: string; refId: string } }>,
  reply: FastifyReply,
) {
  const { id: userId } = request.user as JwtPayload;
  try {
    await usersService.deleteReferenceImage(userId, request.params.fursonaId, request.params.refId);
    return reply.send({ success: true, data: null, error: null });
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'REFERENCE_DELETE_ERROR', message: errMessage(e) } });
  }
}

/**
 * Serve a watermarked reference image.
 * Auth required so that only logged-in users can view it.
 * The original MinIO URL is never returned to the browser.
 */
export async function getWatermarkedReferenceImageHandler(
  request: FastifyRequest<{ Params: { id: string; fursonaId: string; refId: string } }>,
  reply: FastifyReply,
) {
  try {
    const result = await usersService.getWatermarkedReferenceImage(request.params.id, request.params.fursonaId, request.params.refId);
    if (!result) {
      return reply.code(404).send({ success: false, data: null, error: { code: 'REFERENCE_NOT_FOUND', message: 'Reference image not found' } });
    }
    return reply
      .header('Content-Type', result.mimeType)
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .send(result.buffer);
  } catch (e) {
    return reply.code(500).send({ success: false, data: null, error: { code: 'REFERENCE_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    return reply.code(400).send({ success: false, data: null, error: { code: 'FURSUIT_CREATE_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'FURSUIT_UPDATE_ERROR', message: errMessage(e) } });
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
  } catch (e) {
    const code = errStatus(e) ?? 400;
    return reply.code(code).send({ success: false, data: null, error: { code: 'FURSUIT_DELETE_ERROR', message: errMessage(e) } });
  }
}
