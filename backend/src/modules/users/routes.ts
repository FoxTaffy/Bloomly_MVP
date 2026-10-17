import { assertProfileReadable } from '../../lib/contentAccess.js';
import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
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
  searchMusicHandler, proxyMusicMediaHandler,
} from './controller.js';
import {
  getUserParamsSchema, updateUserSchema, updateUsernameSchema, pinPostSchema,
  updateFursonaSchema, fursonaIdParamSchema, updateFursuitSchema, fursuitIdParamSchema,
  upsertReferenceImageSchema, referenceImageIdParamSchema,
} from './schemas.js';

export async function usersRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  // GET /api/users/search?q=
  fastify.get<RouteGenericOf<typeof searchUsersHandler>>('/search', auth, searchUsersHandler);

  // GET /api/users/recommended
  fastify.get<RouteGenericOf<typeof getRecommendedUsersHandler>>('/recommended', auth, getRecommendedUsersHandler);

  // GET /api/users/music/search?q= — server-side proxy for the status music picker
  // (avoids relying on the client's browser being able to reach itunes.apple.com directly)
  fastify.get<RouteGenericOf<typeof searchMusicHandler>>('/music/search', auth, searchMusicHandler);

  // GET /api/users/music/proxy?url= — passthrough for Apple's music CDN (artwork/preview
  // audio), allowlisted to mzstatic.com/apple.com. Public: browser <img>/<audio> tags can't
  // attach the Bearer token, and there's nothing sensitive being proxied here.
  fastify.get<RouteGenericOf<typeof proxyMusicMediaHandler>>('/music/proxy', proxyMusicMediaHandler);

  // PATCH /api/users/me — update own profile
  fastify.patch<RouteGenericOf<typeof updateMeHandler>>('/me', { schema: updateUserSchema, onRequest: [fastify.authenticate] }, updateMeHandler);

  // PATCH /api/users/me/username — change username (unique check)
  fastify.patch<RouteGenericOf<typeof updateUsernameHandler>>('/me/username', { schema: updateUsernameSchema, onRequest: [fastify.authenticate] }, updateUsernameHandler);

  // PUT /api/users/me/pin/:postId — pin a post
  fastify.put<RouteGenericOf<typeof pinPostHandler>>('/me/pin/:postId', { schema: pinPostSchema, onRequest: [fastify.authenticate] }, pinPostHandler);

  // DELETE /api/users/me/pin — unpin the pinned post
  fastify.delete<RouteGenericOf<typeof unpinPostHandler>>('/me/pin', auth, unpinPostHandler);

  // GET /api/users/me/profile-stats — profile analytics (top post, friends growth), Lite+ only
  fastify.get<RouteGenericOf<typeof getProfileStatsHandler>>('/me/profile-stats', auth, getProfileStatsHandler);

  // Block/unblock
  fastify.post<RouteGenericOf<typeof blockUserHandler>>('/:id/block', auth, blockUserHandler);
  fastify.delete<RouteGenericOf<typeof unblockUserHandler>>('/:id/block', auth, unblockUserHandler);
  fastify.get<RouteGenericOf<typeof getBlockStatusHandler>>('/:id/block-status', auth, getBlockStatusHandler);

  // PATCH /api/users/me/subscription — update subscription tier
  fastify.patch<RouteGenericOf<typeof updateSubscriptionHandler>>('/me/subscription', {
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
  }, updateSubscriptionHandler);

  // ── Saved payment methods ────────────────────────────────────────────────
  // GET /api/users/me/payment-methods
  fastify.get<RouteGenericOf<typeof listPaymentMethodsHandler>>('/me/payment-methods', auth, listPaymentMethodsHandler);

  // POST /api/users/me/payment-methods — save a (masked) card
  fastify.post<RouteGenericOf<typeof addPaymentMethodHandler>>('/me/payment-methods', {
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
  }, addPaymentMethodHandler);

  // DELETE /api/users/me/payment-methods/:id
  fastify.delete<RouteGenericOf<typeof deletePaymentMethodHandler>>('/me/payment-methods/:id', auth, deletePaymentMethodHandler);

  // PATCH /api/users/me/payment-methods/:id/default
  fastify.patch<RouteGenericOf<typeof setDefaultPaymentMethodHandler>>('/me/payment-methods/:id/default', auth, setDefaultPaymentMethodHandler);

  // PUT /api/users/me/public-key — store E2E public key
  fastify.put<RouteGenericOf<typeof setPublicKeyHandler>>('/me/public-key', auth, setPublicKeyHandler);

  // GET /api/users/:id/public-key — get user's E2E public key
  fastify.get<RouteGenericOf<typeof getPublicKeyHandler>>('/:id/public-key', getPublicKeyHandler);

  // GET /api/users/:id/media-history — past avatars/banners (public)
  fastify.get<RouteGenericOf<typeof getMediaHistoryHandler>>('/:id/media-history', getMediaHistoryHandler);

  // DELETE /api/users/me/avatar-history/:historyId — remove a historical avatar (owner only)
  fastify.delete<RouteGenericOf<typeof deleteAvatarHistoryHandler>>('/me/avatar-history/:historyId', auth, deleteAvatarHistoryHandler);

  // POST /api/users/me/avatar-history/:historyId/restore — promote historical avatar to current
  fastify.post<RouteGenericOf<typeof restoreAvatarHistoryHandler>>('/me/avatar-history/:historyId/restore', auth, restoreAvatarHistoryHandler);

  // GET /api/users/:id/notify-status — check if following + notify_posts
  fastify.get<RouteGenericOf<typeof notifyStatusHandler>>('/:id/notify-status', auth, notifyStatusHandler);

  // POST /api/users/:id/notify-toggle — toggle notify_posts on Follow row
  fastify.post<RouteGenericOf<typeof notifyToggleHandler>>('/:id/notify-toggle', auth, notifyToggleHandler);

  // DELETE /api/users/me/account — soft-delete own account
  fastify.delete<RouteGenericOf<typeof deleteAccountHandler>>('/me/account', auth, deleteAccountHandler);

  // ── Fursona (1:N per user, up to 10 characters) ───────────────────────────
  // GET  /api/users/:id/fursonas — public character list (likes/dislikes gated by owner setting)
  fastify.get<RouteGenericOf<typeof getFursonasHandler>>('/:id/fursonas', { onRequest: [fastify.tryAuthenticate], preHandler: async req => { await assertProfileReadable((req.params as { id: string }).id, req.user?.id); } }, getFursonasHandler);

  // POST /api/users/me/fursonas — create a new character
  fastify.post<RouteGenericOf<typeof createFursonaHandler>>('/me/fursonas', { schema: updateFursonaSchema, onRequest: [fastify.authenticate] }, createFursonaHandler);

  // PUT  /api/users/me/fursonas/:fursonaId
  fastify.put<RouteGenericOf<typeof updateFursonaHandler>>('/me/fursonas/:fursonaId', { schema: { ...updateFursonaSchema, ...fursonaIdParamSchema }, onRequest: [fastify.authenticate] }, updateFursonaHandler);

  // DELETE /api/users/me/fursonas/:fursonaId — soft delete, reassigns primary if needed
  fastify.delete<RouteGenericOf<typeof deleteFursonaHandler>>('/me/fursonas/:fursonaId', { schema: fursonaIdParamSchema, onRequest: [fastify.authenticate] }, deleteFursonaHandler);

  // PATCH /api/users/me/fursonas/:fursonaId/primary — mark this character as primary
  fastify.patch<RouteGenericOf<typeof setPrimaryFursonaHandler>>('/me/fursonas/:fursonaId/primary', { schema: fursonaIdParamSchema, onRequest: [fastify.authenticate] }, setPrimaryFursonaHandler);

  // ── Fursona reference gallery (1:N per Fursona) ───────────────────────────
  // GET  /api/users/:id/fursonas/:fursonaId/references — public gallery listing
  fastify.get<RouteGenericOf<typeof getReferenceImagesHandler>>('/:id/fursonas/:fursonaId/references', { onRequest: [fastify.tryAuthenticate], preHandler: async req => { await assertProfileReadable((req.params as { id: string }).id, req.user?.id); } }, getReferenceImagesHandler);

  // GET  /api/users/:id/fursonas/:fursonaId/references/:refId/watermarked — watermarked image (auth required)
  fastify.get<RouteGenericOf<typeof getWatermarkedReferenceImageHandler>>('/:id/fursonas/:fursonaId/references/:refId/watermarked', { onRequest: [fastify.authenticate], preHandler: async req => { await assertProfileReadable((req.params as { id: string }).id, req.user?.id); } }, getWatermarkedReferenceImageHandler);

  // POST /api/users/me/fursonas/:fursonaId/references — add a reference image
  fastify.post<RouteGenericOf<typeof addReferenceImageHandler>>('/me/fursonas/:fursonaId/references', { schema: { ...upsertReferenceImageSchema, ...fursonaIdParamSchema }, onRequest: [fastify.authenticate] }, addReferenceImageHandler);

  // PUT  /api/users/me/fursonas/:fursonaId/references/:refId
  fastify.put<RouteGenericOf<typeof updateReferenceImageHandler>>('/me/fursonas/:fursonaId/references/:refId', { schema: { ...upsertReferenceImageSchema, ...referenceImageIdParamSchema }, onRequest: [fastify.authenticate] }, updateReferenceImageHandler);

  // DELETE /api/users/me/fursonas/:fursonaId/references/:refId
  fastify.delete<RouteGenericOf<typeof deleteReferenceImageHandler>>('/me/fursonas/:fursonaId/references/:refId', { schema: referenceImageIdParamSchema, onRequest: [fastify.authenticate] }, deleteReferenceImageHandler);

  // ── Fursuits (1:N per user) ───────────────────────────────────────────────
  // GET  /api/users/:id/fursuits
  fastify.get<RouteGenericOf<typeof getFursuitsHandler>>('/:id/fursuits', { onRequest: [fastify.tryAuthenticate], preHandler: async req => { await assertProfileReadable((req.params as { id: string }).id, req.user?.id); } }, getFursuitsHandler);

  // POST /api/users/me/fursuits — create a new fursuit
  fastify.post<RouteGenericOf<typeof createFursuitHandler>>('/me/fursuits', { schema: updateFursuitSchema, onRequest: [fastify.authenticate] }, createFursuitHandler);

  // PUT  /api/users/me/fursuits/:fursuitId
  fastify.put<RouteGenericOf<typeof updateFursuitHandler>>('/me/fursuits/:fursuitId', { schema: { ...updateFursuitSchema, ...fursuitIdParamSchema }, onRequest: [fastify.authenticate] }, updateFursuitHandler);

  // DELETE /api/users/me/fursuits/:fursuitId — soft delete
  fastify.delete<RouteGenericOf<typeof deleteFursuitHandler>>('/me/fursuits/:fursuitId', { schema: fursuitIdParamSchema, onRequest: [fastify.authenticate] }, deleteFursuitHandler);

  // GET /api/users/:id — public profile (no auth required) — must be last
  fastify.get<RouteGenericOf<typeof getUserHandler>>('/:id', { schema: getUserParamsSchema, onRequest: [fastify.tryAuthenticate] }, getUserHandler);
}
