import { FastifyInstance, RouteShorthandOptions } from 'fastify';
import { pushService } from './service.js';

interface JwtUser { id: string }

export async function pushRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  fastify.get('/key', auth, async (_req, reply) => {
    return reply.send({ success: true, data: { publicKey: pushService.publicKey() }, error: null });
  });

  fastify.post<{ Body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } }>('/subscribe', auth, async (req, reply) => {
    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || !/^https:\/\//.test(endpoint) || endpoint.length > 2000 || !keys?.p256dh || !keys?.auth) {
      return reply.status(400).send({ success: false, data: null, error: { code: 'BAD_INPUT', message: 'Некорректная подписка' } });
    }
    const { id } = req.user as JwtUser;
    await pushService.subscribe(id, { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }, req.headers['user-agent']);
    return reply.send({ success: true, data: { ok: true }, error: null });
  });

  fastify.post<{ Body: { endpoint?: string } }>('/unsubscribe', auth, async (req, reply) => {
    const { id } = req.user as JwtUser;
    if (req.body?.endpoint) await pushService.unsubscribe(id, req.body.endpoint);
    return reply.send({ success: true, data: { ok: true }, error: null });
  });
}
