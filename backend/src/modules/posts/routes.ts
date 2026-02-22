import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPostHandler, votePostHandler, getPostsHandler } from './controller.js';

// The authenticate decorator is declared in auth/routes.ts; this re-declaration
// merges into the same global FastifyInstance augmentation via TypeScript.
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const createPostSchema = {
  body: {
    type: 'object',
    required: ['content'],
    properties: {
      content: { type: 'string', minLength: 1 },
      isNsfw: { type: 'boolean' },
    },
  },
};

const voteSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['value'],
    properties: {
      value: { type: 'integer', enum: [1, -1] },
    },
  },
};

const getPostsSchema = {
  querystring: {
    type: 'object',
    properties: {
      sortBy: { type: 'string', enum: ['date', 'rating'] },
    },
  },
};

export async function postsRoutes(fastify: FastifyInstance) {
  fastify.post('/', { schema: createPostSchema, onRequest: [fastify.authenticate] }, createPostHandler);
  fastify.post('/:id/vote', { schema: voteSchema, onRequest: [fastify.authenticate] }, votePostHandler);
  fastify.get('/', { schema: getPostsSchema }, getPostsHandler);
}
