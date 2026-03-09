import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import {
  getStoriesHandler,
  createStoryHandler,
  deleteStoryHandler,
  getUserStoriesHandler,
} from './controller.js';

export async function storiesRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // GET /api/stories — active stories (last 24h)
  fastify.get('/', getStoriesHandler as any);

  // GET /api/stories/user/:userId — stories by user
  fastify.get('/user/:userId', getUserStoriesHandler as any);

  // POST /api/stories — create story (auth required)
  fastify.post('/', auth, createStoryHandler as any);

  // DELETE /api/stories/:id — soft-delete story (owner only)
  fastify.delete('/:id', auth, deleteStoryHandler as any);
}

