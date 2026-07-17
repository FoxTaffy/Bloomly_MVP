import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  getUserHandler, updateMeHandler, updateUsernameHandler, getRecommendedUsersHandler, searchUsersHandler,
  pinPostHandler, unpinPostHandler, getMediaHistoryHandler,
  blockUserHandler, unblockUserHandler, getBlockStatusHandler,
  setPublicKeyHandler, getPublicKeyHandler,
  notifyStatusHandler, notifyToggleHandler,
  updateSubscriptionHandler, deleteAccountHandler, getProfileStatsHandler,
  listPaymentMethodsHandler, addPaymentMethodHandler, deletePaymentMethodHandler, setDefaultPaymentMethodHandler,
  deleteAvatarHistoryHandler, restoreAvatarHistoryHandler,
  getFursonasHandler, createFursonaHandler, updateFursonaHandler, deleteFursonaHandler, setPrimaryFursonaHandler,
  getReferenceImagesHandler, addReferenceImageHandler, updateReferenceImageHandler, deleteReferenceImageHandler, getWatermarkedReferenceImageHandler,
  getFursuitsHandler, createFursuitHandler, updateFursuitHandler, deleteFursuitHandler,
} from './controller.js';
import {
  getUserParamsSchema, updateUserSchema, updateUsernameSchema, pinPostSchema,
  updateFursonaSchema, fursonaIdParamSchema, updateFursuitSchema, fursuitIdParamSchema,
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

  // GET /api/users/me/profile-stats — profile analytics (top post, friends growth), Lite+ only
  fastify.get('/me/profile-stats', auth, getProfileStatsHandler as any);

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

  // ── Fursona (1:N per user, up to 10 characters) ───────────────────────────
  // GET  /api/users/:id/fursonas — public character list (likes/dislikes gated by owner setting)
  fastify.get('/:id/fursonas', getFursonasHandler as any);

  // POST /api/users/me/fursonas — create a new character
  fastify.post('/me/fursonas', { schema: updateFursonaSchema, onRequest: [fastify.authenticate] }, createFursonaHandler as any);

  // PUT  /api/users/me/fursonas/:fursonaId
  fastify.put('/me/fursonas/:fursonaId', { schema: { ...updateFursonaSchema, ...fursonaIdParamSchema }, onRequest: [fastify.authenticate] }, updateFursonaHandler as any);

  // DELETE /api/users/me/fursonas/:fursonaId — soft delete, reassigns primary if needed
  fastify.delete('/me/fursonas/:fursonaId', { schema: fursonaIdParamSchema, onRequest: [fastify.authenticate] }, deleteFursonaHandler as any);

  // PATCH /api/users/me/fursonas/:fursonaId/primary — mark this character as primary
  fastify.patch('/me/fursonas/:fursonaId/primary', { schema: fursonaIdParamSchema, onRequest: [fastify.authenticate] }, setPrimaryFursonaHandler as any);

  // ── Fursona reference gallery (1:N per Fursona) ───────────────────────────
  // GET  /api/users/:id/fursonas/:fursonaId/references — public gallery listing
  fastify.get('/:id/fursonas/:fursonaId/references', getReferenceImagesHandler as any);

  // GET  /api/users/:id/fursonas/:fursonaId/references/:refId/watermarked — watermarked image (auth required)
  fastify.get('/:id/fursonas/:fursonaId/references/:refId/watermarked', auth, getWatermarkedReferenceImageHandler as any);

  // POST /api/users/me/fursonas/:fursonaId/references — add a reference image
  fastify.post('/me/fursonas/:fursonaId/references', { schema: { ...upsertReferenceImageSchema, ...fursonaIdParamSchema }, onRequest: [fastify.authenticate] }, addReferenceImageHandler as any);

  // PUT  /api/users/me/fursonas/:fursonaId/references/:refId
  fastify.put('/me/fursonas/:fursonaId/references/:refId', { schema: { ...upsertReferenceImageSchema, ...referenceImageIdParamSchema }, onRequest: [fastify.authenticate] }, updateReferenceImageHandler as any);

  // DELETE /api/users/me/fursonas/:fursonaId/references/:refId
  fastify.delete('/me/fursonas/:fursonaId/references/:refId', { schema: referenceImageIdParamSchema, onRequest: [fastify.authenticate] }, deleteReferenceImageHandler as any);

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
