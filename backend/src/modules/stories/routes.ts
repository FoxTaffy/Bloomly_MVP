import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import prisma from '../../config/prisma.js';

export async function storiesRoutes(fastify: FastifyInstance) {
  // GET /api/stories — last 24 h
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const stories = await prisma.story.findMany({
        where: { created_at: { gte: twentyFourHoursAgo } },
        include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
        orderBy: { created_at: 'desc' },
      });
      return reply.send({ success: true, data: { stories }, error: null });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch stories';
      return reply.code(500).send({ success: false, data: null, error: { code: 'GET_STORIES_ERROR', message } });
    }
  });

  // POST /api/stories — create story (auth required)
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = (request as any).user as { id: string };
      const { image_url } = request.body as { image_url?: string };
      const expires_at = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const story = await prisma.story.create({
        data: { user_id: payload.id, image_url: image_url ?? null, expires_at },
        include: { user: { select: { id: true, username: true, display_name: true, avatar_url: true } } },
      });
      return reply.code(201).send({ success: true, data: { story }, error: null });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create story';
      return reply.code(500).send({ success: false, data: null, error: { code: 'CREATE_STORY_ERROR', message } });
    }
  });
}

