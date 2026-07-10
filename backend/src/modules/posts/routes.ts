import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import { createPostHandler, votePostHandler, getPostsHandler, getPersonalizedPostsHandler, repawPostHandler, favouritePostHandler, getUserPostStatusHandler, createCommentHandler, getCommentsHandler, voteCommentHandler, deletePostHandler, editPostHandler, deleteCommentHandler, getTrendingTagsHandler, getUserPostsHandler, getUserMediaPostsHandler, getUserRepawsHandler, getUserFavouritesHandler, getPostByIdHandler, getMyBookmarksHandler } from './controller.js';

// The authenticate decorator is declared in auth/routes.ts; this re-declaration
// merges into the same global FastifyInstance augmentation via TypeScript.
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    tryAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
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
      value: { type: 'integer', minimum: -1, maximum: 1 },
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
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  const tryAuth: RouteShorthandOptions = { onRequest: [fastify.tryAuthenticate] };

  // ── Static / non-parametric ─────────────────────────────────────────────
  fastify.get('/', { schema: getPostsSchema }, getPostsHandler as any);
  fastify.get('/personalized', auth, getPersonalizedPostsHandler as any);
  fastify.get('/trending-tags', getTrendingTagsHandler as any);
  fastify.get('/status', auth, getUserPostStatusHandler as any);

  // ── Private "me" routes (must come before /user/:userId) ────────────────
  fastify.get('/me/bookmarks', auth, getMyBookmarksHandler as any);

  // ── User-specific ───────────────────────────────────────────────────────
  fastify.get('/user/:userId',        tryAuth, getUserPostsHandler as any);
  fastify.get('/user/:userId/media',  tryAuth, getUserMediaPostsHandler as any);
  fastify.get('/user/:userId/repaws', tryAuth, getUserRepawsHandler as any);
  fastify.get('/user/:userId/likes',  tryAuth, getUserFavouritesHandler as any);

  // ── Comment sub-resources ───────────────────────────────────────────────
  fastify.post('/comments/:commentId/vote', auth, voteCommentHandler as any);
  fastify.delete('/comments/:commentId',    auth, deleteCommentHandler as any);

  // ── Single-post actions ─────────────────────────────────────────────────
  fastify.post('/', { schema: createPostSchema, onRequest: [fastify.authenticate] }, createPostHandler as any);
  fastify.get('/:id', getPostByIdHandler as any);
  fastify.delete('/:id', auth, deletePostHandler as any);
  fastify.patch('/:id',  auth, editPostHandler as any);
  fastify.post('/:id/vote',      { schema: voteSchema, onRequest: [fastify.authenticate] }, votePostHandler as any);
  fastify.post('/:id/repaw',     auth, repawPostHandler as any);
  fastify.post('/:id/favourite', auth, favouritePostHandler as any);
  fastify.post('/:id/comments',  auth, createCommentHandler as any);
  fastify.get('/:id/comments',   getCommentsHandler as any);
}
