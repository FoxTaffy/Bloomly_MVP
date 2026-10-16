import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { albumService } from './service.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';

type AlbumBody = { groupId?: string; title?: string; description?: string; privacy?: string; items?: string[] };

const viewerOf = (req: FastifyRequest): string | null => (req.user as { id: string } | undefined)?.id ?? null;

function fail(reply: FastifyReply, e: unknown) {
  const status = errStatus(e) ?? 500;
  return reply.code(status).send({ success: false, data: null, error: { code: 'ALBUM_ERROR', message: errMessage(e) } });
}

const notFound = (reply: FastifyReply) =>
  reply.code(404).send({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Альбом не найден' } });

export async function albumRoutes(fastify: FastifyInstance) {
  // Свежий массив хуков на каждый маршрут (плагин лимитов дописывает хуки в общий массив)
  const optional = () => ({ onRequest: [fastify.tryAuthenticate] });
  const auth = () => ({ onRequest: [fastify.authenticate] });

  // GET /api/albums?userId=… | ?groupId=…
  fastify.get<{ Querystring: { userId?: string; groupId?: string } }>('/', optional(), async (req, reply) => {
    const { userId, groupId } = req.query;
    if (!userId && !groupId) {
      return reply.code(400).send({ success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Укажите userId или groupId' } });
    }
    try {
      const albums = await albumService.list(userId ? { userId } : { groupId: groupId! }, viewerOf(req));
      return reply.send({ success: true, data: { albums }, error: null });
    } catch (e) { return fail(reply, e); }
  });

  fastify.get<{ Params: { id: string } }>('/:id', optional(), async (req, reply) => {
    try {
      const album = await albumService.get(req.params.id, viewerOf(req));
      return album ? reply.send({ success: true, data: { album }, error: null }) : notFound(reply);
    } catch (e) { return fail(reply, e); }
  });

  fastify.post<{ Body: AlbumBody }>('/', { ...auth(), config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req, reply) => {
    try {
      const album = await albumService.create(viewerOf(req)!, req.body ?? {});
      return reply.code(201).send({ success: true, data: { album }, error: null });
    } catch (e) { return fail(reply, e); }
  });

  fastify.patch<{ Params: { id: string }; Body: AlbumBody }>('/:id', auth(), async (req, reply) => {
    try {
      const album = await albumService.update(req.params.id, viewerOf(req)!, req.body ?? {});
      return album ? reply.send({ success: true, data: { album }, error: null }) : notFound(reply);
    } catch (e) { return fail(reply, e); }
  });

  fastify.delete<{ Params: { id: string } }>('/:id', auth(), async (req, reply) => {
    try {
      return (await albumService.remove(req.params.id, viewerOf(req)!))
        ? reply.send({ success: true, data: null, error: null })
        : notFound(reply);
    } catch (e) { return fail(reply, e); }
  });
}
