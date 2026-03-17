import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import { listItems, getItem, purchaseItem, getMyItems } from './service.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const ok = (data: unknown) => ({ success: true, data, error: null });
const err = (code: string, msg: string) => ({ success: false, data: null, error: { code, message: msg } });

export async function shopRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  // GET /api/shop/items?type=&page=&limit=
  fastify.get('/items', async (req: FastifyRequest, reply: FastifyReply) => {
    const q = req.query as Record<string, string>;
    const userId = (req as any).user?.id as string | undefined;
    const page = Math.max(1, parseInt(q.page ?? '1'));
    const limit = Math.min(50, Math.max(1, parseInt(q.limit ?? '24')));
    const result = await listItems({ type: q.type, page, limit, userId });
    reply.send(ok(result));
  });

  // GET /api/shop/items/:id
  fastify.get('/items/:id', async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const userId = (req as any).user?.id as string | undefined;
    const item = await getItem(id, userId);
    if (!item) return reply.status(404).send(err('NOT_FOUND', 'Item not found'));
    reply.send(ok(item));
  });

  // POST /api/shop/items/:id/purchase  (auth required)
  fastify.post('/items/:id/purchase', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const userId = (req as any).user.id as string;
    try {
      await purchaseItem(userId, id);
      reply.send(ok({ purchased: true }));
    } catch (e: any) {
      const status = e.statusCode ?? 400;
      reply.status(status).send(err('PURCHASE_ERROR', e.message));
    }
  });

  // GET /api/shop/my?type=  (auth required)
  fastify.get('/my', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = (req as any).user.id as string;
    const q = req.query as Record<string, string>;
    const items = await getMyItems(userId, q.type);
    reply.send(ok(items));
  });
}
