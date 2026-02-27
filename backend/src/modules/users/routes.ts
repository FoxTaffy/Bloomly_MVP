import type { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  getUserHandler, updateMeHandler, getRecommendedUsersHandler, searchUsersHandler,
  pinPostHandler, unpinPostHandler, toggleAdModeHandler, getMediaHistoryHandler,
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

  // POST /api/users/me/ad-toggle — toggle advertiser role
  fastify.post('/me/ad-toggle', auth, toggleAdModeHandler as any);

  // GET /api/users/:id/media-history — past avatars/banners (public)
  fastify.get('/:id/media-history', getMediaHistoryHandler as any);

  // GET /api/users/:id — public profile (no auth required) — must be last
  fastify.get('/:id', { schema: getUserParamsSchema }, getUserHandler as any);
}
