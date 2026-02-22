import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getConversationsHandler,
  createConversationHandler,
  getMessagesHandler,
  sendMessageHandler,
  markReadHandler,
} from './controller.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function conversationsRoutes(fastify: FastifyInstance) {
  fastify.get('/', { onRequest: [fastify.authenticate] }, getConversationsHandler);

  fastify.post('/', {
    schema: {
      body: {
        type: 'object',
        required: ['participant_id'],
        properties: { participant_id: { type: 'string' } },
      },
    },
    onRequest: [fastify.authenticate],
  }, createConversationHandler);

  fastify.get('/:id/messages', { onRequest: [fastify.authenticate] }, getMessagesHandler);

  fastify.post('/:id/messages', {
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string', minLength: 1 } },
      },
    },
    onRequest: [fastify.authenticate],
  }, sendMessageHandler);

  fastify.post('/:id/read', { onRequest: [fastify.authenticate] }, markReadHandler);
}
