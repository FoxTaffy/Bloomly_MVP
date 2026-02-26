import type { FastifyInstance } from 'fastify';
import { getUserHandler, updateMeHandler, getRecommendedUsersHandler, searchUsersHandler } from './controller.js';
import { getUserParamsSchema, updateUserSchema } from './schemas.js';

export async function usersRoutes(fastify: FastifyInstance) {
  // GET /api/users/search?q= — search users by username/display_name (auth required)
  fastify.get(
    '/search',
    { onRequest: [fastify.authenticate] },
    searchUsersHandler,
  );

  // GET /api/users/recommended — suggested users to follow (auth required)
  fastify.get(
    '/recommended',
    { onRequest: [fastify.authenticate] },
    getRecommendedUsersHandler,
  );

  // PATCH /api/users/me — update own profile (auth required)
  fastify.patch(
    '/me',
    { schema: updateUserSchema, onRequest: [fastify.authenticate] },
    updateMeHandler,
  );

  // GET /api/users/:id — public profile (no auth required) — must be last
  fastify.get('/:id', { schema: getUserParamsSchema }, getUserHandler);
}
