import { FastifyInstance } from 'fastify';
import { getMaxRequestBytes } from './limits.js';
import { initUploadHandler, uploadStatusHandler, uploadChunkHandler, completeUploadHandler, abortUploadHandler } from './chunked.js';
import { CHUNK_BYTES } from '../../config/uploads.js';
import { uploadFileHandler, getPrivateMediaHandler, mediaAuthzHandler } from './controller.js';
import type { RouteGenericOf } from '../../lib/routeTypes.js';

export async function mediaRoutes(fastify: FastifyInstance) {
  // POST /api/media/upload — upload file to object storage
  fastify.post<RouteGenericOf<typeof uploadFileHandler>>('/upload', { bodyLimit: getMaxRequestBytes(), onRequest: [fastify.authenticate] }, uploadFileHandler);
  // Чанковая загрузка (файлы крупнее 50 МБ): части по 25 МБ проходят через Cloudflare (лимит тела 100 МБ)
  fastify.addContentTypeParser('application/octet-stream', (_req, payload, done) => done(null, payload));
  fastify.post('/upload/init', { onRequest: [fastify.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, initUploadHandler);
  fastify.get<{ Params: { uploadId: string } }>('/upload/:uploadId', { onRequest: [fastify.authenticate] }, uploadStatusHandler);
  fastify.patch<{ Params: { uploadId: string } }>('/upload/:uploadId', { bodyLimit: CHUNK_BYTES + 1024 * 1024, onRequest: [fastify.authenticate], config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, uploadChunkHandler);
  fastify.post<{ Params: { uploadId: string } }>('/upload/:uploadId/complete', { onRequest: [fastify.authenticate], config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, completeUploadHandler);
  fastify.delete<{ Params: { uploadId: string } }>('/upload/:uploadId', { onRequest: [fastify.authenticate] }, abortUploadHandler);
  // GET /api/media/private?url=… — приватные файлы (улики, верификация) отдаёт только сервер по правам.
  // Без регистрации маршрута модераторы не могли открыть улики, а бакет эти объекты не отдаёт напрямую.
  fastify.get('/private', { onRequest: [fastify.authenticate] }, getPrivateMediaHandler);
  // GET /api/media/authz — подзапрос nginx auth_request на каждый файл /s3/…; страница ленты
  // даёт десятки таких запросов, поэтому общий rate-limit здесь не применяется (ответ кэшируется).
  fastify.get('/authz', { config: { rateLimit: false } }, mediaAuthzHandler);
}
