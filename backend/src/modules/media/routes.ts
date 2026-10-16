import { FastifyInstance } from 'fastify';
import { uploadFileHandler, getPrivateMediaHandler } from './controller.js';
import type { RouteGenericOf } from '../../lib/routeTypes.js';

export async function mediaRoutes(fastify: FastifyInstance) {
  // POST /api/media/upload — upload file to object storage
  fastify.post<RouteGenericOf<typeof uploadFileHandler>>('/upload', { onRequest: [fastify.authenticate] }, uploadFileHandler);
  // GET /api/media/private?url=… — приватные файлы (улики, верификация) отдаёт только сервер по правам.
  // Без регистрации маршрута модераторы не могли открыть улики, а бакет эти объекты не отдаёт напрямую.
  fastify.get('/private', { onRequest: [fastify.authenticate] }, getPrivateMediaHandler);
}
