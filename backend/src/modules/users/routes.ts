import type { FastifyInstance } from 'fastify';
import { getUserHandler, updateMeHandler } from './controller.js';
import { getUserParamsSchema, updateUserSchema } from './schemas.js';

export async function usersRoutes(fastify: FastifyInstance) {
  // GET /api/users/:id — public profile (no auth required)
  fastify.get('/:id', { schema: getUserParamsSchema }, getUserHandler);

  // PATCH /api/users/me — update own profile (auth required)
  fastify.patch(
    '/me',
    { schema: updateUserSchema, onRequest: [fastify.authenticate] },
    updateMeHandler,
  );
}
