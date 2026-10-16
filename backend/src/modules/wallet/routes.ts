import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import { topupWallet, getWallet } from './service.js';
import { isDevEnv } from '../../lib/env.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';

const ok = (data: unknown) => ({ success: true, data, error: null });
const err = (code: string, msg: string) => ({ success: false, data: null, error: { code, message: msg } });

export async function walletRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };

  fastify.get('/', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.user.id;
    const result = await getWallet(userId);
    reply.send(ok(result));
  });

  fastify.post('/topup', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    // Бесплатное пополнение создаёт деньги из ничего (их можно тратить в магазине и донатить группам).
    // Доступно только вне production и только до подключения платёжного шлюза.
    if (!isDevEnv()) {
      return reply.code(403).send(err('TOPUP_DISABLED', 'Пополнение баланса временно недоступно'));
    }
    const userId = req.user.id;
    const { amount } = req.body as { amount: number };
    try {
      const result = await topupWallet(userId, Number(amount));
      reply.send(ok(result));
    } catch (e) {
      reply.code(errStatus(e) ?? 400).send(err('TOPUP_ERROR', errMessage(e)));
    }
  });
}
