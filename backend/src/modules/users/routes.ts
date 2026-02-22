import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getUserByUsernameHandler,
  getUserByIdHandler,
  updateUserHandler,
  followUserHandler,
  blockUserHandler,
  getFollowersHandler,
  getFollowingHandler,
  getMeHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function usersRoutes(fastify: FastifyInstance) {
  fastify.get('/me', { onRequest: [fastify.authenticate] }, getMeHandler);

  fastify.get('/username/:username', getUserByUsernameHandler);

  fastify.get('/:id', getUserByIdHandler);

  fastify.put('/:id', {
    schema: {
      body: {
        type: 'object',
        properties: {
          display_name: { type: 'string', maxLength: 100 },
          status_text: { type: 'string', maxLength: 300 },
          persona: { type: 'string', maxLength: 100 },
          city: { type: 'string', maxLength: 100 },
          avatar_url: { type: 'string' },
          header_url: { type: 'string' },
          likes_list: { type: 'array', items: { type: 'string' } },
          dislikes_list: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    onRequest: [fastify.authenticate],
  }, updateUserHandler);

  fastify.post('/:id/follow', { onRequest: [fastify.authenticate] }, followUserHandler);

  fastify.post('/:id/block', { onRequest: [fastify.authenticate] }, blockUserHandler);

  fastify.get('/:id/followers', getFollowersHandler);

  fastify.get('/:id/following', getFollowingHandler);
}
