import { FastifyInstance } from 'fastify';
import { uploadFileHandler } from './controller.js';

export async function mediaRoutes(fastify: FastifyInstance) {
  // POST /api/media/upload — upload file to object storage
  fastify.post('/upload', { onRequest: [fastify.authenticate] }, uploadFileHandler);
}
