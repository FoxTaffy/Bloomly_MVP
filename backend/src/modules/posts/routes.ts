import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPostHandler, votePostHandler, getPostsHandler, getPersonalizedPostsHandler, repawPostHandler, favouritePostHandler, getUserPostStatusHandler, createCommentHandler, getCommentsHandler, voteCommentHandler, deletePostHandler, editPostHandler, deleteCommentHandler, getTrendingTagsHandler, getUserPostsHandler, getUserMediaPostsHandler, getUserRepawsHandler, getUserFavouritesHandler } from './controller.js';

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
      content: { type: 'string', minLength: 1, pattern: '.*\\S.*' },
      isNsfw: { type: 'boolean' },
      category: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      mediaUrls: { type: 'array', items: { type: 'string' } },
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
  fastify.post('/:id/repaw', { onRequest: [fastify.authenticate] }, repawPostHandler);
  fastify.post('/:id/favourite', { onRequest: [fastify.authenticate] }, favouritePostHandler);
  fastify.post('/:id/comments', { onRequest: [fastify.authenticate] }, createCommentHandler);
  fastify.get('/:id/comments', getCommentsHandler);
  fastify.post('/comments/:commentId/vote', { onRequest: [fastify.authenticate] }, voteCommentHandler);
  fastify.delete('/comments/:commentId', { onRequest: [fastify.authenticate] }, deleteCommentHandler);
  fastify.delete('/:id', { onRequest: [fastify.authenticate] }, deletePostHandler);
  fastify.patch('/:id', { onRequest: [fastify.authenticate] }, editPostHandler);
  fastify.get('/trending-tags', getTrendingTagsHandler);
  fastify.get('/status', { onRequest: [fastify.authenticate] }, getUserPostStatusHandler);
  // User-specific endpoints (must come before /:id)
  fastify.get('/user/:userId', getUserPostsHandler);
  fastify.get('/user/:userId/media', getUserMediaPostsHandler);
  fastify.get('/user/:userId/repaws', getUserRepawsHandler);
  fastify.get('/user/:userId/likes', getUserFavouritesHandler);
  fastify.get('/', { schema: getPostsSchema }, getPostsHandler);
  fastify.get('/personalized', { onRequest: [fastify.authenticate] }, getPersonalizedPostsHandler);
}
