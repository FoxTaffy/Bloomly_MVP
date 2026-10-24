import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import { createPostHandler, votePostHandler, getPostsHandler, searchPostsHandler, searchTagsHandler, getPersonalizedPostsHandler, checkNewPostsHandler, repawPostHandler, favouritePostHandler, getUserPostStatusHandler, createCommentHandler, getCommentsHandler, voteCommentHandler, deletePostHandler, editPostHandler, deleteCommentHandler, getTrendingTagsHandler, suggestTagsHandler, getUserPostsHandler, getUserMediaPostsHandler, getUserRepawsHandler, getUserFavouritesHandler, getPostByIdHandler, getMyBookmarksHandler, getMyPostsLikedByHandler, recordPostViewHandler, toggleArchivePostHandler, toggleCommentsDisabledHandler, getUserArchivedPostsHandler, getPostStatsHandler, getTagInsightsHandler, setNotInterestedHandler, getBoostInfoHandler, boostPostHandler } from './controller.js';
import { createScheduledPostHandler, listScheduledPostsHandler, updateScheduledPostHandler, cancelScheduledPostHandler, publishNowScheduledPostHandler } from './scheduledController.js';

// The authenticate decorator is declared in auth/routes.ts; this re-declaration
// merges into the same global FastifyInstance augmentation via TypeScript.
const createPostSchema = {
  body: {
    type: 'object',
    properties: {
      // Not required/non-empty at the schema level: a post can be media-only (no
      // caption). postService.createPost enforces "content OR mediaUrls" instead.
      content: { type: 'string' },
      isNsfw: { type: 'boolean' },
      isAiGenerated: { type: 'boolean' },
      category: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      mediaUrls: { type: 'array', items: { type: 'string' } },
      mediaOriginalUrls: { type: 'array', items: { type: 'string' } },
    },
  },
};

const editPostSchema = {
  body: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      isNsfw: { type: 'boolean' },
      isAiGenerated: { type: 'boolean' },
      tags: { type: 'array', items: { type: 'string' } },
      addMediaUrls: { type: 'array', items: { type: 'string' } },
      addMediaOriginalUrls: { type: 'array', items: { type: 'string' } },
      listingId: { type: ['string', 'null'] },
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

const notInterestedSchema = {
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
      value: { type: 'boolean' },
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
  fastify.get<RouteGenericOf<typeof getPostsHandler>>('/', { schema: getPostsSchema, onRequest: [fastify.tryAuthenticate] }, getPostsHandler);
  fastify.get<RouteGenericOf<typeof searchPostsHandler>>('/search', tryAuth, searchPostsHandler);
  fastify.get<RouteGenericOf<typeof searchTagsHandler>>('/search/tags', tryAuth, searchTagsHandler);
  fastify.get<RouteGenericOf<typeof getPersonalizedPostsHandler>>('/personalized', auth, getPersonalizedPostsHandler);
  fastify.get<RouteGenericOf<typeof checkNewPostsHandler>>('/check-new', auth, checkNewPostsHandler);
  fastify.get<RouteGenericOf<typeof getTrendingTagsHandler>>('/trending-tags', getTrendingTagsHandler);
  fastify.get<RouteGenericOf<typeof suggestTagsHandler>>('/tags/suggest', suggestTagsHandler);
  fastify.get<RouteGenericOf<typeof getUserPostStatusHandler>>('/status', auth, getUserPostStatusHandler);
  fastify.get('/boost-info', auth, getBoostInfoHandler);

  // ── Private "me" routes (must come before /user/:userId) ────────────────
  fastify.get<RouteGenericOf<typeof getMyBookmarksHandler>>('/me/bookmarks', auth, getMyBookmarksHandler);
  fastify.get<RouteGenericOf<typeof getMyPostsLikedByHandler>>('/me/liked-by/:userId', { ...auth, schema: { params: { type: 'object', required: ['userId'], properties: { userId: { type: 'string', format: 'uuid' } } } } }, getMyPostsLikedByHandler);
  fastify.get<RouteGenericOf<typeof getTagInsightsHandler>>('/me/tag-insights', auth, getTagInsightsHandler);

  // ── Scheduled posts / drafts ────────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof createScheduledPostHandler>>('/scheduled', auth, createScheduledPostHandler);
  fastify.get<RouteGenericOf<typeof listScheduledPostsHandler>>('/scheduled', auth, listScheduledPostsHandler);
  fastify.patch<RouteGenericOf<typeof updateScheduledPostHandler>>('/scheduled/:id', auth, updateScheduledPostHandler);
  fastify.delete<RouteGenericOf<typeof cancelScheduledPostHandler>>('/scheduled/:id', auth, cancelScheduledPostHandler);
  fastify.post<RouteGenericOf<typeof publishNowScheduledPostHandler>>('/scheduled/:id/publish-now', auth, publishNowScheduledPostHandler);

  // ── User-specific ───────────────────────────────────────────────────────
  fastify.get<RouteGenericOf<typeof getUserPostsHandler>>('/user/:userId',          tryAuth, getUserPostsHandler);
  fastify.get<RouteGenericOf<typeof getUserMediaPostsHandler>>('/user/:userId/media',    tryAuth, getUserMediaPostsHandler);
  fastify.get<RouteGenericOf<typeof getUserRepawsHandler>>('/user/:userId/repaws',   tryAuth, getUserRepawsHandler);
  fastify.get<RouteGenericOf<typeof getUserFavouritesHandler>>('/user/:userId/likes',    tryAuth, getUserFavouritesHandler);
  fastify.get<RouteGenericOf<typeof getUserArchivedPostsHandler>>('/user/:userId/archived', auth,    getUserArchivedPostsHandler);

  // ── Comment sub-resources ───────────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof voteCommentHandler>>('/comments/:commentId/vote', auth, voteCommentHandler);
  fastify.delete<RouteGenericOf<typeof deleteCommentHandler>>('/comments/:commentId',    auth, deleteCommentHandler);

  // ── Single-post actions ─────────────────────────────────────────────────
  fastify.post<RouteGenericOf<typeof createPostHandler>>('/', { schema: createPostSchema, onRequest: [fastify.authenticate] }, createPostHandler);
  fastify.get<RouteGenericOf<typeof getPostByIdHandler>>('/:id', tryAuth, getPostByIdHandler);
  fastify.delete<RouteGenericOf<typeof deletePostHandler>>('/:id', auth, deletePostHandler);
  fastify.patch<RouteGenericOf<typeof editPostHandler>>('/:id',  { ...auth, schema: editPostSchema }, editPostHandler);
  fastify.post<RouteGenericOf<typeof votePostHandler>>('/:id/vote',      { schema: voteSchema, onRequest: [fastify.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, votePostHandler);
  fastify.post<RouteGenericOf<typeof repawPostHandler>>('/:id/repaw',     { onRequest: [fastify.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, repawPostHandler);
  fastify.post<RouteGenericOf<typeof favouritePostHandler>>('/:id/favourite', auth, favouritePostHandler);
  fastify.post<RouteGenericOf<typeof createCommentHandler>>('/:id/comments',  { onRequest: [fastify.authenticate], config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, createCommentHandler);
  fastify.get<RouteGenericOf<typeof getCommentsHandler>>('/:id/comments',   { onRequest: [fastify.tryAuthenticate] }, getCommentsHandler);
  fastify.post<RouteGenericOf<typeof recordPostViewHandler>>('/:id/view',      tryAuth, recordPostViewHandler);
  fastify.post<RouteGenericOf<typeof toggleArchivePostHandler>>('/:id/archive',   auth, toggleArchivePostHandler);
  fastify.post<RouteGenericOf<typeof boostPostHandler>>('/:id/boost', { onRequest: [fastify.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, boostPostHandler);
  fastify.post<RouteGenericOf<typeof toggleCommentsDisabledHandler>>('/:id/comments-toggle', auth, toggleCommentsDisabledHandler);
  fastify.post<RouteGenericOf<typeof setNotInterestedHandler>>('/:id/not-interested', { schema: notInterestedSchema, onRequest: [fastify.authenticate] }, setNotInterestedHandler);
  fastify.get<RouteGenericOf<typeof getPostStatsHandler>>('/:id/stats',      auth, getPostStatsHandler);
}
