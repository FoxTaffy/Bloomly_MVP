import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { reportService } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function reportsRoutes(fastify: FastifyInstance) {
  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['targetType', 'targetId', 'reason'],
        properties: {
          targetType: { type: 'string', enum: ['user', 'post', 'comment'] },
          targetId: { type: 'string' },
          reason: { type: 'string', minLength: 5, maxLength: 500 },
        },
      },
    },
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const { id: reporterId } = (request as any).user;
      const { targetType, targetId, reason } = request.body as any;
      const report = await reportService.createReport({ reporterId, targetType, targetId, reason });
      return reply.code(201).send({ success: true, data: { report }, error: null });
    } catch (error: any) {
      return reply.code(400).send({ success: false, error: { code: 'REPORT_ERROR', message: error.message } });
    }
  });
}
