import { FastifyInstance, FastifyRequest, FastifyReply, RouteShorthandOptions } from 'fastify';
import { paymentsService } from './service.js';
import { devPaymentsAllowed } from './config.js';
import type { YookassaNotification } from './yookassa.js';
import { isAdmin } from '../../lib/roles.js';
import { errMessage, errStatus } from '../../lib/httpErrors.js';
import { logger } from '../../lib/logger.js';

const ok = (data: unknown) => ({ success: true, data, error: null });
const err = (code: string, msg: string) => ({ success: false, data: null, error: { code, message: msg } });

/** Ошибки сервиса: код = сообщение, если оно в UPPER_SNAKE (PAYMENTS_DISABLED, INSUFFICIENT_FUNDS…). */
function fail(reply: FastifyReply, e: unknown, fallbackCode: string) {
  const msg = errMessage(e);
  const status = errStatus(e);
  if (!status) logger.error({ err: e }, `[payments] ${fallbackCode}`);
  const code = /^[A-Z_]+$/.test(msg) ? msg : fallbackCode;
  return reply.code(status ?? 500).send(err(code, status ? msg : 'Internal error'));
}

export async function paymentsRoutes(fastify: FastifyInstance) {
  const auth: RouteShorthandOptions = { onRequest: [fastify.authenticate] };
  const authLimited: RouteShorthandOptions = {
    onRequest: [fastify.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  } as RouteShorthandOptions;

  // GET /api/payments/config — включена ли оплата, цены для этого пользователя, лимиты пополнения
  fastify.get('/config', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    try { reply.send(ok(await paymentsService.getConfig(req.user.id))); }
    catch (e) { fail(reply, e, 'PAYMENTS_CONFIG_ERROR'); }
  });

  // GET /api/payments/subscription/quote?tier=pro&period=month
  fastify.get('/subscription/quote', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    const { tier, period } = req.query as { tier?: string; period?: string };
    try { reply.send(ok(await paymentsService.quote(req.user.id, tier, period))); }
    catch (e) { fail(reply, e, 'QUOTE_ERROR'); }
  });

  // POST /api/payments/topup { amount, method: 'AC' | 'PC' } → { paymentId, confirmationUrl }
  fastify.post('/topup', authLimited, async (req: FastifyRequest, reply: FastifyReply) => {
    const { amount, method } = (req.body ?? {}) as { amount?: unknown; method?: unknown };
    try { reply.send(ok(await paymentsService.createTopup(req.user.id, amount, method))); }
    catch (e) { fail(reply, e, 'TOPUP_ERROR'); }
  });

  // POST /api/payments/donate { amount, method: 'AC' | 'PC' } → { paymentId, confirmationUrl }
  fastify.post('/donate', authLimited, async (req: FastifyRequest, reply: FastifyReply) => {
    const { amount, method } = (req.body ?? {}) as { amount?: unknown; method?: unknown };
    try { reply.send(ok(await paymentsService.createDonation(req.user.id, amount, method))); }
    catch (e) { fail(reply, e, 'DONATE_ERROR'); }
  });

  // POST /api/payments/subscription { tier, period: 'month' | 'year', method: 'AC' | 'PC' | 'wallet' }
  fastify.post('/subscription', authLimited, async (req: FastifyRequest, reply: FastifyReply) => {
    const { tier, period, method } = (req.body ?? {}) as { tier?: unknown; period?: unknown; method?: unknown };
    try { reply.send(ok(await paymentsService.createSubscription(req.user.id, tier, period, method))); }
    catch (e) { fail(reply, e, 'SUBSCRIPTION_PAYMENT_ERROR'); }
  });

  // GET /api/payments — история успешных платежей текущего пользователя
  fastify.get('/', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    reply.send(ok(await paymentsService.listMine(req.user.id)));
  });

  // GET /api/payments/admin?status=review — все платежи (админ)
  fastify.get('/admin', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!isAdmin(req.user.role)) return reply.code(403).send(err('FORBIDDEN', 'Forbidden'));
    const { status } = req.query as { status?: string };
    reply.send(ok(await paymentsService.listAll(status || undefined)));
  });

  // GET /api/payments/:id — статус платежа (страница возврата опрашивает его)
  fastify.get('/:id', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    try { reply.send(ok(await paymentsService.getPayment(req.user.id, id))); }
    catch (e) { fail(reply, e, 'PAYMENT_ERROR'); }
  });

  // POST /api/payments/:id/dev-confirm — имитация успешной оплаты, только dev/test
  fastify.post('/:id/dev-confirm', auth, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!devPaymentsAllowed()) return reply.code(404).send(err('NOT_FOUND', 'Not found'));
    const { id } = req.params as { id: string };
    try { reply.send(ok(await paymentsService.devConfirm(req.user.id, id))); }
    catch (e) { fail(reply, e, 'PAYMENT_ERROR'); }
  });

  // POST /api/payments/yookassa/notify — webhook ЮKassa (без авторизации; платёж перепроверяется через API).
  // Адрес указывается в личном кабинете: Интеграция → HTTP-уведомления (события payment.succeeded, payment.canceled)
  fastify.post('/yookassa/notify', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } } as RouteShorthandOptions,
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await paymentsService.handleYookassaNotification((req.body ?? {}) as YookassaNotification);
        reply.code(200).send('OK');
      } catch (e) {
        const status = errStatus(e);
        if (!status) logger.error({ err: e }, '[payments] yookassa notification failed');
        // 5xx → ЮKassa повторит уведомление позже
        reply.code(status ?? 500).send(errMessage(e));
      }
    });
}
