import { FastifyInstance } from 'fastify';
import { searchService } from './service.js';

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.get('/', {
    schema: {
      querystring: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', minLength: 1 },
          type: { type: 'string', enum: ['users', 'posts', 'hashtags'] },
          page: { type: 'string' },
          limit: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const { query, type, page, limit } = request.query as any;
      const results = await searchService.search(
        query,
        type,
        parseInt(page) || 1,
        parseInt(limit) || 20
      );
      return reply.send({ success: true, data: results, error: null });
    } catch (error: any) {
      return reply.code(500).send({ success: false, error: { code: 'SEARCH_ERROR', message: error.message } });
    }
  });
}
