import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createPostHandler,
  getPostsHandler,
  getPostHandler,
  updatePostHandler,
  deletePostHandler,
  votePostHandler,
  repostHandler,
  savePostHandler,
  getSavedPostsHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function postsRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          sortBy: { type: 'string', enum: ['date', 'rating'] },
          page: { type: 'string' },
          limit: { type: 'string' },
          userId: { type: 'string' },
          groupId: { type: 'string' },
          hashtag: { type: 'string' },
        },
      },
    },
  }, getPostsHandler);

  fastify.get('/saved', { onRequest: [fastify.authenticate] }, getSavedPostsHandler);

  fastify.get('/:id', {
    schema: { params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } } },
  }, getPostHandler);

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1 },
          isNsfw: { type: 'boolean' },
          groupId: { type: 'string' },
        },
      },
    },
    onRequest: [fastify.authenticate],
  }, createPostHandler);

  fastify.put('/:id', {
    schema: {
      body: { type: 'object', properties: { content: { type: 'string', minLength: 1 } } },
    },
    onRequest: [fastify.authenticate],
  }, updatePostHandler);

  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, deletePostHandler);

  fastify.post('/:id/vote', {
    schema: {
      body: { type: 'object', required: ['value'], properties: { value: { type: 'integer', enum: [1, -1] } } },
    },
    onRequest: [fastify.authenticate],
  }, votePostHandler);

  fastify.post('/:id/repost', { onRequest: [fastify.authenticate] }, repostHandler);

  fastify.post('/:id/save', { onRequest: [fastify.authenticate] }, savePostHandler);
}
