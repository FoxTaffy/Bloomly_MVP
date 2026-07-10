import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  getUserHandler, updateMeHandler, updateUsernameHandler, getRecommendedUsersHandler, searchUsersHandler,
  pinPostHandler, unpinPostHandler, getMediaHistoryHandler,
  blockUserHandler, unblockUserHandler, getBlockStatusHandler,
  setPublicKeyHandler, getPublicKeyHandler,
  notifyStatusHandler, notifyToggleHandler,
  updateSubscriptionHandler, deleteAccountHandler,
  listPaymentMethodsHandler, addPaymentMethodHandler, deletePaymentMethodHandler, setDefaultPaymentMethodHandler,
  deleteAvatarHistoryHandler, restoreAvatarHistoryHandler,
  getFursonaHandler, upsertFursonaHandler,
  getReferenceImagesHandler, addReferenceImageHandler, updateReferenceImageHandler, deleteReferenceImageHandler, getWatermarkedReferenceImageHandler,
  getFursuitsHandler, createFursuitHandler, updateFursuitHandler, deleteFursuitHandler,
} from './controller.js';
import {
  getUserParamsSchema, updateUserSchema, updateUsernameSchema, pinPostSchema,
  updateFursonaSchema, updateFursuitSchema, fursuitIdParamSchema,
  upsertReferenceImageSchema, referenceImageIdParamSchema,
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

  // ── Saved payment methods ────────────────────────────────────────────────
  // GET /api/users/me/payment-methods
  fastify.get('/me/payment-methods', auth, listPaymentMethodsHandler as any);

  // POST /api/users/me/payment-methods — save a (masked) card
  fastify.post('/me/payment-methods', {
    schema: {
      body: {
        type: 'object',
        required: ['cardNumber', 'expMonth', 'expYear', 'holderName'],
        properties: {
          cardNumber: { type: 'string', minLength: 12, maxLength: 23 },
          expMonth: { type: 'integer', minimum: 1, maximum: 12 },
          expYear: { type: 'integer', minimum: 2024, maximum: 2100 },
          holderName: { type: 'string', minLength: 2, maxLength: 60 },
          setDefault: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    onRequest: [fastify.authenticate],
  }, addPaymentMethodHandler as any);

  // DELETE /api/users/me/payment-methods/:id
  fastify.delete('/me/payment-methods/:id', auth, deletePaymentMethodHandler as any);

  // PATCH /api/users/me/payment-methods/:id/default
  fastify.patch('/me/payment-methods/:id/default', auth, setDefaultPaymentMethodHandler as any);

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

  // GET  /api/users/:id/fursona — public fursona (likes/dislikes gated by owner setting)
  fastify.get('/:id/fursona', getFursonaHandler as any);

  // ── Fursona reference gallery (1:N per user) ──────────────────────────────
  // GET  /api/users/:id/fursona/references — public gallery listing
  fastify.get('/:id/fursona/references', getReferenceImagesHandler as any);

  // GET  /api/users/:id/fursona/references/:refId/watermarked — watermarked image (auth required)
  fastify.get('/:id/fursona/references/:refId/watermarked', auth, getWatermarkedReferenceImageHandler as any);

  // POST /api/users/me/fursona/references — add a reference image
  fastify.post('/me/fursona/references', { schema: upsertReferenceImageSchema, onRequest: [fastify.authenticate] }, addReferenceImageHandler as any);

  // PUT  /api/users/me/fursona/references/:refId
  fastify.put('/me/fursona/references/:refId', { schema: { ...upsertReferenceImageSchema, ...referenceImageIdParamSchema }, onRequest: [fastify.authenticate] }, updateReferenceImageHandler as any);

  // DELETE /api/users/me/fursona/references/:refId
  fastify.delete('/me/fursona/references/:refId', { schema: referenceImageIdParamSchema, onRequest: [fastify.authenticate] }, deleteReferenceImageHandler as any);

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
