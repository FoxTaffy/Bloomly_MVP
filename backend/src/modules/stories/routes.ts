import { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { RouteGenericOf } from '../../lib/routeTypes.js';
import {
  getStoriesHandler,
  createStoryHandler,
  deleteStoryHandler,
  getUserStoriesHandler,
  viewStoryHandler,
  getStoryViewersHandler,
  voteStoryHandler,
} from './controller.js';

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const idParamSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', pattern: UUID_PATTERN },
    },
  },
};

const userIdParamSchema = {
  params: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: 'string', pattern: UUID_PATTERN },
    },
  },
};

const createStorySchema = {
  body: {
    type: 'object',
    anyOf: [{ required: ['image_url'] }, { required: ['video_url'] }],
    properties: {
      image_url: { type: 'string', minLength: 1, maxLength: 2048 },
      video_url: { type: 'string', minLength: 1, maxLength: 2048 },
    },
    additionalProperties: false,
  },
};

const voteSchema = {
  ...idParamSchema,
  body: {
    type: 'object',
    required: ['value'],
    properties: {
      value: { type: 'integer', enum: [1, -1] },
    },
    additionalProperties: false,
  },
};

export async function storiesRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  const tryAuth: RouteShorthandOptions = { onRequest: [fastify.tryAuthenticate] };

  // GET /api/stories — active stories (last 24h)
  fastify.get<RouteGenericOf<typeof getStoriesHandler>>('/', tryAuth, getStoriesHandler);

  // GET /api/stories/user/:userId — stories by user
  fastify.get<RouteGenericOf<typeof getUserStoriesHandler>>('/user/:userId', { ...tryAuth, schema: userIdParamSchema } as RouteShorthandOptions, getUserStoriesHandler);

  // POST /api/stories — create story (auth required)
  fastify.post<RouteGenericOf<typeof createStoryHandler>>('/', {
    ...auth,
    schema: createStorySchema,
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  } as RouteShorthandOptions, createStoryHandler);

  // DELETE /api/stories/:id — soft-delete story (owner only)
  fastify.delete<RouteGenericOf<typeof deleteStoryHandler>>('/:id', { ...auth, schema: idParamSchema } as RouteShorthandOptions, deleteStoryHandler);

  // POST /api/stories/:id/view — mark story as viewed by the current user
  fastify.post<RouteGenericOf<typeof viewStoryHandler>>('/:id/view', {
    ...auth,
    schema: idParamSchema,
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  } as RouteShorthandOptions, viewStoryHandler);

  // GET /api/stories/:id/viewers — list of viewers (owner only)
  fastify.get<RouteGenericOf<typeof getStoryViewersHandler>>('/:id/viewers', { ...auth, schema: idParamSchema } as RouteShorthandOptions, getStoryViewersHandler);

  // POST /api/stories/:id/vote — thumbs up/down (toggle)
  fastify.post<RouteGenericOf<typeof voteStoryHandler>>('/:id/vote', {
    ...auth,
    schema: voteSchema,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  } as RouteShorthandOptions, voteStoryHandler);
}
