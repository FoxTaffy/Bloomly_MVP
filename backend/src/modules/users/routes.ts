import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  getUserHandler, updateMeHandler, updateUsernameHandler, getRecommendedUsersHandler, searchUsersHandler,
  pinPostHandler, unpinPostHandler, getMediaHistoryHandler,
  blockUserHandler, unblockUserHandler, getBlockStatusHandler,
  setPublicKeyHandler, getPublicKeyHandler,
  notifyStatusHandler, notifyToggleHandler,
  updateSubscriptionHandler, deleteAccountHandler,
  deleteAvatarHistoryHandler, restoreAvatarHistoryHandler,
  getFursonaHandler, upsertFursonaHandler, getReferenceImageHandler,
  getFursuitsHandler, createFursuitHandler, updateFursuitHandler, deleteFursuitHandler,
} from './controller.js';
import {
  getUserParamsSchema, updateUserSchema, updateUsernameSchema, pinPostSchema,
  updateFursonaSchema, updateFursuitSchema, fursuitIdParamSchema,
} from './schemas.js';

export async function usersRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  // GET /api/users/search?q=
  fastify.get('/search', auth, searchUsersHandler as any);

  // GET /api/users/recommended
  fastify.get('/recommended', auth, getRecommendedUsersHandler as any);

  // PATCH /api/users/me — update own profile
  fastify.patch('/me', { schema: updateUserSchema, onRequest: [fastify.authenticate] }, updateMeHandler as any);

  // PATCH /api/users/me/username — change username (unique check)
  fastify.patch('/me/username', { schema: updateUsernameSchema, onRequest: [fastify.authenticate] }, updateUsernameHandler as any);

  // PUT /api/users/me/pin/:postId — pin a post
  fastify.put('/me/pin/:postId', { schema: pinPostSchema, onRequest: [fastify.authenticate] }, pinPostHandler as any);

  // DELETE /api/users/me/pin — unpin the pinned post
  fastify.delete('/me/pin', auth, unpinPostHandler as any);

  // Block/unblock
  fastify.post('/:id/block', auth, blockUserHandler as any);
  fastify.delete('/:id/block', auth, unblockUserHandler as any);
  fastify.get('/:id/block-status', auth, getBlockStatusHandler as any);

  // PATCH /api/users/me/subscription — update subscription tier
  fastify.patch('/me/subscription', {
    schema: {
      body: {
        type: 'object',
        required: ['tier'],
        properties: {
          tier: { type: 'string', enum: ['free', 'lite', 'pro', 'business'] },
        },
        additionalProperties: false,
      },
    },
    onRequest: [fastify.authenticate],
  }, updateSubscriptionHandler as any);

  // PUT /api/users/me/public-key — store E2E public key
  fastify.put('/me/public-key', auth, setPublicKeyHandler as any);

  // GET /api/users/:id/public-key — get user's E2E public key
  fastify.get('/:id/public-key', getPublicKeyHandler as any);

  // GET /api/users/:id/media-history — past avatars/banners (public)
  fastify.get('/:id/media-history', getMediaHistoryHandler as any);

  // DELETE /api/users/me/avatar-history/:historyId — remove a historical avatar (owner only)
  fastify.delete('/me/avatar-history/:historyId', auth, deleteAvatarHistoryHandler as any);

  // POST /api/users/me/avatar-history/:historyId/restore — promote historical avatar to current
  fastify.post('/me/avatar-history/:historyId/restore', auth, restoreAvatarHistoryHandler as any);

  // GET /api/users/:id/notify-status — check if following + notify_posts
  fastify.get('/:id/notify-status', auth, notifyStatusHandler as any);

  // POST /api/users/:id/notify-toggle — toggle notify_posts on Follow row
  fastify.post('/:id/notify-toggle', auth, notifyToggleHandler as any);

  // DELETE /api/users/me/account — soft-delete own account
  fastify.delete('/me/account', auth, deleteAccountHandler as any);

  // ── Fursona (1:1 per user) ────────────────────────────────────────────────
  // PUT  /api/users/me/fursona  — create or update own fursona
  fastify.put('/me/fursona', { schema: updateFursonaSchema, onRequest: [fastify.authenticate] }, upsertFursonaHandler as any);

  // GET  /api/users/me/fursona/reference — serve own watermarked reference (auth)
  fastify.get('/me/fursona/reference', auth, async (req, reply) => {
    const { id: userId } = (req as any).user as { id: string };
    const result = await import('./service.js').then((m) =>
      m.usersService.getWatermarkedReference(userId),
    );
    if (!result) return reply.code(404).send({ success: false, data: null, error: { code: 'REFERENCE_NOT_FOUND', message: 'No reference image' } });
    return reply
      .header('Content-Type', result.mimeType)
      .header('Cache-Control', 'private, no-store')
      .send(result.buffer);
  });

  // GET  /api/users/:id/fursona — public fursona (likes/dislikes gated by owner setting)
  fastify.get('/:id/fursona', getFursonaHandler as any);

  // GET  /api/users/:id/fursona/reference — watermarked reference (auth required)
  fastify.get('/:id/fursona/reference', auth, getReferenceImageHandler as any);

  // ── Fursuits (1:N per user) ───────────────────────────────────────────────
  // GET  /api/users/:id/fursuits
  fastify.get('/:id/fursuits', getFursuitsHandler as any);

  // POST /api/users/me/fursuits — create a new fursuit
  fastify.post('/me/fursuits', { schema: updateFursuitSchema, onRequest: [fastify.authenticate] }, createFursuitHandler as any);

  // PUT  /api/users/me/fursuits/:fursuitId
  fastify.put('/me/fursuits/:fursuitId', { schema: { ...updateFursuitSchema, ...fursuitIdParamSchema }, onRequest: [fastify.authenticate] }, updateFursuitHandler as any);

  // DELETE /api/users/me/fursuits/:fursuitId — soft delete
  fastify.delete('/me/fursuits/:fursuitId', { schema: fursuitIdParamSchema, onRequest: [fastify.authenticate] }, deleteFursuitHandler as any);

  // GET /api/users/:id — public profile (no auth required) — must be last
  fastify.get('/:id', { schema: getUserParamsSchema, onRequest: [fastify.tryAuthenticate] }, getUserHandler as any);
}
