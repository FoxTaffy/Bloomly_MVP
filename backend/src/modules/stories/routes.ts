import { FastifyInstance, FastifyReply, FastifyRequest, RouteShorthandOptions } from 'fastify';
import {
  getStoriesHandler,
  createStoryHandler,
  deleteStoryHandler,
  getUserStoriesHandler,
  viewStoryHandler,
  getStoryViewersHandler,
  voteStoryHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    tryAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

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
  fastify.get('/', tryAuth, getStoriesHandler as any);

  // GET /api/stories/user/:userId — stories by user
  fastify.get('/user/:userId', { ...tryAuth, schema: userIdParamSchema } as RouteShorthandOptions, getUserStoriesHandler as any);

  // POST /api/stories — create story (auth required)
  fastify.post('/', {
    ...auth,
    schema: createStorySchema,
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
  } as RouteShorthandOptions, createStoryHandler as any);

  // DELETE /api/stories/:id — soft-delete story (owner only)
  fastify.delete('/:id', { ...auth, schema: idParamSchema } as RouteShorthandOptions, deleteStoryHandler as any);

  // POST /api/stories/:id/view — mark story as viewed by the current user
  fastify.post('/:id/view', {
    ...auth,
    schema: idParamSchema,
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  } as RouteShorthandOptions, viewStoryHandler as any);

  // GET /api/stories/:id/viewers — list of viewers (owner only)
  fastify.get('/:id/viewers', { ...auth, schema: idParamSchema } as RouteShorthandOptions, getStoryViewersHandler as any);

  // POST /api/stories/:id/vote — thumbs up/down (toggle)
  fastify.post('/:id/vote', {
    ...auth,
    schema: voteSchema,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  } as RouteShorthandOptions, voteStoryHandler as any);
}
