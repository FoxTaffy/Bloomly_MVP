import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getCommentsHandler,
  createCommentHandler,
  updateCommentHandler,
  deleteCommentHandler,
  voteCommentHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function commentsRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        required: ['post_id'],
        properties: { post_id: { type: 'string' } },
      },
    },
  }, getCommentsHandler);

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['postId', 'content'],
        properties: {
          postId: { type: 'string' },
          content: { type: 'string', minLength: 1 },
          parentCommentId: { type: 'string' },
        },
      },
    },
    onRequest: [fastify.authenticate],
  }, createCommentHandler);

  fastify.put('/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string', minLength: 1 } },
      },
    },
    onRequest: [fastify.authenticate],
  }, updateCommentHandler);

  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, deleteCommentHandler);

  fastify.post('/:id/vote', {
    schema: {
      body: {
        type: 'object',
        required: ['value'],
        properties: { value: { type: 'integer', enum: [1, -1] } },
      },
    },
    onRequest: [fastify.authenticate],
  }, voteCommentHandler);
}
