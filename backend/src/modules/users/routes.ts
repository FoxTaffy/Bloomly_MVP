import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  getUserHandler, updateMeHandler, getRecommendedUsersHandler, searchUsersHandler,
  pinPostHandler, unpinPostHandler, getMediaHistoryHandler,
  blockUserHandler, unblockUserHandler, getBlockStatusHandler,
  setPublicKeyHandler, getPublicKeyHandler,
  notifyStatusHandler, notifyToggleHandler,
} from './controller.js';
import { getUserParamsSchema, updateUserSchema, pinPostSchema } from './schemas.js';

export async function usersRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  // GET /api/users/search?q=
  fastify.get('/search', auth, searchUsersHandler as any);

  // GET /api/users/recommended
  fastify.get('/recommended', auth, getRecommendedUsersHandler as any);

  // PATCH /api/users/me — update own profile
  fastify.patch('/me', { schema: updateUserSchema, onRequest: [fastify.authenticate] }, updateMeHandler as any);

  // PUT /api/users/me/pin/:postId — pin a post
  fastify.put('/me/pin/:postId', { schema: pinPostSchema, onRequest: [fastify.authenticate] }, pinPostHandler as any);

  // DELETE /api/users/me/pin — unpin the pinned post
  fastify.delete('/me/pin', auth, unpinPostHandler as any);

  // Block/unblock
  fastify.post('/:id/block', auth, blockUserHandler as any);
  fastify.delete('/:id/block', auth, unblockUserHandler as any);
  fastify.get('/:id/block-status', auth, getBlockStatusHandler as any);

  // PUT /api/users/me/public-key — store E2E public key
  fastify.put('/me/public-key', auth, setPublicKeyHandler as any);

  // GET /api/users/:id/public-key — get user's E2E public key
  fastify.get('/:id/public-key', getPublicKeyHandler as any);

  // GET /api/users/:id/media-history — past avatars/banners (public)
  fastify.get('/:id/media-history', getMediaHistoryHandler as any);

  // GET /api/users/:id/notify-status — check if following + notify_posts
  fastify.get('/:id/notify-status', auth, notifyStatusHandler as any);

  // POST /api/users/:id/notify-toggle — toggle notify_posts on Follow row
  fastify.post('/:id/notify-toggle', auth, notifyToggleHandler as any);

  // GET /api/users/:id — public profile (no auth required) — must be last
  fastify.get('/:id', { schema: getUserParamsSchema }, getUserHandler as any);
}
