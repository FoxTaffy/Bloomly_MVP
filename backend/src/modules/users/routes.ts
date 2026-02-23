import type { FastifyInstance } from 'fastify';
import { getUserHandler, getUserByUsernameHandler, updateMeHandler } from './controller.js';
import { getUserParamsSchema, getUserByUsernameSchema, updateUserSchema } from './schemas.js';

export async function usersRoutes(fastify: FastifyInstance) {
  // GET /api/users/by-username/:username — public profile lookup by username
  fastify.get('/by-username/:username', {
    schema: getUserByUsernameSchema,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, getUserByUsernameHandler);

  // GET /api/users/:id — public profile (no auth required)
  fastify.get('/:id', { schema: getUserParamsSchema }, getUserHandler);

  // PATCH /api/users/me — update own profile (auth required)
  fastify.patch(
    '/me',
    { schema: updateUserSchema, onRequest: [fastify.authenticate] },
    updateMeHandler,
  );
}
