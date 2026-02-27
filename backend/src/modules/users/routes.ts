import type { FastifyInstance } from 'fastify';
import {
  getUserHandler, updateMeHandler, getRecommendedUsersHandler, searchUsersHandler,
  pinPostHandler, unpinPostHandler, toggleAdModeHandler,
} from './controller.js';
import { getUserParamsSchema, updateUserSchema, pinPostSchema } from './schemas.js';

export async function usersRoutes(fastify: FastifyInstance) {
  // GET /api/users/search?q=
  fastify.get('/search', { onRequest: [fastify.authenticate] }, searchUsersHandler);

  // GET /api/users/recommended
  fastify.get('/recommended', { onRequest: [fastify.authenticate] }, getRecommendedUsersHandler);

  // PATCH /api/users/me — update own profile
  fastify.patch('/me', { schema: updateUserSchema, onRequest: [fastify.authenticate] }, updateMeHandler);

  // PUT /api/users/me/pin/:postId — pin a post
  fastify.put('/me/pin/:postId', { schema: pinPostSchema, onRequest: [fastify.authenticate] }, pinPostHandler);

  // DELETE /api/users/me/pin — unpin the pinned post
  fastify.delete('/me/pin', { onRequest: [fastify.authenticate] }, unpinPostHandler);

  // POST /api/users/me/ad-toggle — toggle advertiser role
  fastify.post('/me/ad-toggle', { onRequest: [fastify.authenticate] }, toggleAdModeHandler);

  // GET /api/users/:id — public profile (no auth required) — must be last
  fastify.get('/:id', { schema: getUserParamsSchema }, getUserHandler);
}
