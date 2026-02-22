import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getGroupsHandler, getGroupHandler, createGroupHandler, joinGroupHandler } from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function groupsRoutes(fastify: FastifyInstance) {
  fastify.get('/', getGroupsHandler);

  fastify.get('/:id', getGroupHandler);

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'slug'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 100 },
          slug: { type: 'string', minLength: 2, maxLength: 50, pattern: '^[a-z0-9-]+$' },
          description: { type: 'string', maxLength: 500 },
          type: { type: 'string', enum: ['creative', 'meme', 'event', 'other'] },
        },
      },
    },
    onRequest: [fastify.authenticate],
  }, createGroupHandler);

  fastify.post('/:id/join', { onRequest: [fastify.authenticate] }, joinGroupHandler);
}
