import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { paymentsService, addMonths } from '../src/modules/payments/service.js';

// ЮKassa подменяется через fetch: «магазин» хранит созданные платежи и отдаёт их по GET.
type PM = { id: string; type: string; saved: boolean; title?: string; card?: Record<string, string> };
type Remote = {
  id: string; status: string; paid: boolean; amount: { value: string; currency: string };
  income_amount: { value: string; currency: string }; metadata: Record<string, string>;
  confirmation?: { type: string; confirmation_url: string };
  payment_method?: PM; cancellation_details?: { party?: string; reason?: string };
  request: Record<string, unknown>;
};
const remote = new Map<string, Remote>();
const refunds: { payment_id: string; amount: { value: string } }[] = [];
/** Чем ответит ЮKassa на автосписание по сохранённому способу. */
let chargeOutcome: { status: 'succeeded' | 'canceled'; reason?: string } = { status: 'succeeded' };
let seq = 0;
let refundFails = false;

const CARD: PM = {
  id: 'pm-card-1', type: 'bank_card', saved: true, title: 'Bank card *4444',
  card: { first6: '555555', last4: '4444', expiry_month: '12', expiry_year: '2030', card_type: 'MasterCard' },
};
const realFetch = globalThis.fetch;

function mockYookassa() {
  remote.clear();
  refunds.length = 0;
  refundFails = false;
  chargeOutcome = { status: 'succeeded' };
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith('https://api.yookassa.ru/v3')) return realFetch(url, init);
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    if (init?.method === 'POST' && u.endsWith('/refunds')) {
      if (refundFails) return new Response('boom', { status: 500 });
      const body = JSON.parse(String(init.body));
      refunds.push(body);
      return json({ id: `rf-${++seq}`, status: 'succeeded' });
    }
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const id = `yk-${++seq}`;
      const base = {
        id, amount: body.amount, metadata: body.metadata, request: body,
        income_amount: { value: (Number(body.amount.value) * 0.97).toFixed(2), currency: 'RUB' },
      };
      // Автоплатёж: без confirmation, итог сразу в ответе
      const r: Remote = body.payment_method_id
        ? {
          ...base, status: chargeOutcome.status, paid: chargeOutcome.status === 'succeeded',
          payment_method: { ...CARD, id: body.payment_method_id },
          ...(chargeOutcome.reason ? { cancellation_details: { party: 'payment_network', reason: chargeOutcome.reason } } : {}),
        }
        : { ...base, status: 'pending', paid: false, confirmation: { type: 'redirect', confirmation_url: `https://yoomoney.ru/checkout/${id}` } };
      remote.set(id, r);
      return json(r);
    }
    const found = remote.get(u.split('/').pop()!);
    return found ? json(found) : new Response('{"type":"error","code":"not_found"}', { status: 404 });
  }) as typeof fetch;
}

/** Покупатель оплатил на стороне ЮKassa — меняем платёж в «магазине» и шлём webhook. */
async function pay(remoteId: string, over: Partial<Remote> = {}, event = 'payment.succeeded') {
  Object.assign(remote.get(remoteId)!, { status: 'succeeded', paid: true }, over);
  return webhook(remoteId, event);
}

async function webhook(remoteId: string, event = 'payment.succeeded') {
  const a = await getApp();
  return a.inject({
    method: 'POST', url: '/api/payments/yookassa/notify',
    headers: { 'content-type': 'application/json' },
    payload: { type: 'notification', event, object: { id: remoteId } },
  });
}

const remoteIdOf = async (paymentId: string) =>
  (await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).provider_operation_id!;

const balanceOf = async (userId: string) =>
  Number((await prisma.wallet.findUnique({ where: { user_id: userId } }))?.balance ?? 0);

describe('payments: ЮKassa', () => {
  beforeAll(() => getApp());
  beforeEach(async () => {
    await resetDb();
    process.env.YOOKASSA_SHOP_ID = '123456';
    process.env.YOOKASSA_SECRET_KEY = 'test_secret';
    process.env.YOOKASSA_RECURRING = 'true';
    mockYookassa();
  });
  afterEach(() => {
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
    delete process.env.YOOKASSA_RECURRING;
    globalThis.fetch = realFetch;
  });

  it('без ключей оплата через шлюз выключена', async () => {
    delete process.env.YOOKASSA_SECRET_KEY;
    const { auth } = await createUser();
    const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 100, method: 'AC' } });
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe('PAYMENTS_DISABLED');
    const cfg = await api('GET', '/api/payments/config', { headers: auth });
    expect(cfg.json.data.enabled).toBe(false);
  });

  it('пакеты пополнения не дешевле базового курса 1 Bloom = 90 ₽', async () => {
    const { auth } = await createUser();
    const cfg = await api('GET', '/api/payments/config', { headers: auth });
    expect(cfg.json.data.bcRate).toBe(90);
    for (const p of cfg.json.data.topup.packages) expect(p.rub).toBeGreaterThanOrEqual(p.bc * 90); // не дешевле базового курса
    expect(cfg.json.data.topup.packages.filter((p: { popular?: boolean }) => p.popular)).toHaveLength(1);
  });

  it('пополнение: ссылка на оплату, зачисление по webhook, повтор не зачисляет дважды', async () => {
    const { user, auth } = await createUser();
    const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'AC' } });
    expect(res.status).toBe(200);
    const { paymentId, confirmationUrl } = res.json.data;
    expect(confirmationUrl).toMatch(/^https:\/\/yoomoney\.ru\/checkout\//);
    const rid = await remoteIdOf(paymentId);
    expect(remote.get(rid)!.metadata.payment_id).toBe(paymentId);

    expect((await pay(rid)).statusCode).toBe(200);
    expect((await webhook(rid)).statusCode).toBe(200);
    expect(await balanceOf(user.id)).toBe(4.62); // своя сумма — по розничному курсу 108 ₽, вниз до сотых

    const status = await api('GET', `/api/payments/${paymentId}`, { headers: auth });
    expect(status.json.data.status).toBe('succeeded');
  });

  it('webhook не верят на слово: платёж, который в ЮKassa не оплачен, не зачисляется', async () => {
    const { user, auth } = await createUser();
    const { json } = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'AC' } });
    const rid = await remoteIdOf(json.data.paymentId);
    expect((await webhook(rid)).statusCode).toBe(200); // «подделка»: в магазине статус всё ещё pending
    expect(await balanceOf(user.id)).toBe(0);
    expect((await webhook('unknown-id')).statusCode).toBe(200);
  });

  it('оплачено меньше ожидаемого или не в рублях → review без зачисления; отмена → expired', async () => {
    const { user, auth } = await createUser();
    const a = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'AC' } });
    await pay(await remoteIdOf(a.json.data.paymentId), { amount: { value: '50.00', currency: 'RUB' } });
    const b = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'PC' } });
    await pay(await remoteIdOf(b.json.data.paymentId), { amount: { value: '500.00', currency: 'USD' } });
    const c = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'AC' } });
    await pay(await remoteIdOf(c.json.data.paymentId), { status: 'canceled', paid: false }, 'payment.canceled');

    expect(await balanceOf(user.id)).toBe(0);
    const rows = await prisma.payment.findMany({ where: { user_id: user.id }, orderBy: { created_at: 'asc' } });
    expect(rows.map((r) => r.status)).toEqual(['review', 'review', 'expired']);
  });

  it('пакет зачисляет свои Blooms: 540 ₽ → 5', async () => {
    const { user, auth } = await createUser();
    const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 540, method: 'AC' } });
    await pay(await remoteIdOf(res.json.data.paymentId));
    expect(await balanceOf(user.id)).toBe(5);
  });

  it('донат: сумма проверяется, после оплаты платёж succeeded и выдаётся значок спонсора', async () => {
    const { user, auth } = await createUser();
    for (const amount of [5, 100, 499, 100.5, 10_000_000, 'abc']) {
      expect((await api('POST', '/api/payments/donate', { headers: auth, body: { amount, method: 'AC' } })).status).toBe(400);
    }
    const res = await api('POST', '/api/payments/donate', { headers: auth, body: { amount: 500, method: 'PC' } });
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).is_sponsor).toBe(false);
    await pay(await remoteIdOf(res.json.data.paymentId));
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: res.json.data.paymentId } });
    expect(p.status).toBe('succeeded');
    expect(p.purpose).toBe('donation');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).is_sponsor).toBe(true);
    expect(await balanceOf(user.id)).toBe(0);
  });

  it('сумма пополнения проверяется на сервере', async () => {
    const { auth } = await createUser();
    for (const amount of [10, 75, 100.5, 1_000_000, 'abc']) {
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount, method: 'AC' } });
      expect(res.status).toBe(400);
    }
  });

  it('подписка: цену считает сервер, после оплаты тариф выдаётся на период', async () => {
    const { user, auth } = await createUser({ created_at: new Date('2027-06-01T00:00:00Z') });
    const res = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'pro', period: 'year', method: 'AC' } });
    expect(res.status).toBe(200);
    expect(res.json.data.amount).toBe(249 * 12);

    await pay(await remoteIdOf(res.json.data.paymentId));
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(u.subscription_tier).toBe('pro');
    const days = (u.subscription_expires_at!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(360);
    expect(days).toBeLessThan(370);
  });

  it('ранним пользователям скидка 50%; business и free не продаются', async () => {
    const { auth } = await createUser({ created_at: new Date('2026-01-01T00:00:00Z') });
    const q = await api('GET', '/api/payments/subscription/quote?tier=lite&period=month', { headers: auth });
    expect(q.json.data.amount).toBe(75);
    for (const tier of ['business', 'free', 'god']) {
      const res = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier, period: 'month', method: 'AC' } });
      expect(res.status).toBe(400);
    }
  });

  it('оплата подписки с баланса: списание, продление того же тарифа, нехватка средств', async () => {
    const { user, auth } = await createUser({ created_at: new Date('2027-06-01T00:00:00Z') });
    await prisma.wallet.create({ data: { user_id: user.id, balance: 5 } });

    const first = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'wallet' } });
    expect(first.status).toBe(200);
    expect(first.json.data.status).toBe('succeeded');
    const exp1 = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_expires_at!;

    const second = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'wallet' } });
    expect(second.status).toBe(200);
    const exp2 = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_expires_at!;
    expect(exp2.getTime()).toBe(addMonths(exp1, 1).getTime()); // продлено от конца периода, а не от «сейчас»
    expect(await balanceOf(user.id)).toBeCloseTo(5 - 1.66 * 2, 2); // 149 ₽ = 1.66 BC (вверх до сотых)

    const broke = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'pro', period: 'month', method: 'wallet' } });
    expect(broke.status).toBe(402);
    expect(broke.json.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('бессрочный тариф от админа не перезаписывается покупкой', async () => {
    const { auth } = await createUser({ subscription_tier: 'business' });
    const res = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'AC' } });
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe('SUBSCRIPTION_COMPED');
  });

  it('истёкшая подписка сбрасывается в free, бессрочная остаётся', async () => {
    const { user: paid } = await createUser({ subscription_tier: 'pro', subscription_expires_at: new Date(Date.now() - 1000) });
    const { user: comped } = await createUser({ subscription_tier: 'business' });
    expect(await paymentsService.expireSubscriptions()).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: paid.id } })).subscription_tier).toBe('free');
    expect((await prisma.user.findUniqueOrThrow({ where: { id: comped.id } })).subscription_tier).toBe('business');
  });

  it('чужой платёж не виден, dev-confirm подтверждает свой', async () => {
    const { user, auth } = await createUser();
    const { auth: otherAuth } = await createUser();
    const { json } = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 100, method: 'AC' } });
    expect((await api('GET', `/api/payments/${json.data.paymentId}`, { headers: otherAuth })).status).toBe(404);
    expect((await api('POST', `/api/payments/${json.data.paymentId}/dev-confirm`, { headers: otherAuth })).status).toBe(404);

    const ok = await api('POST', `/api/payments/${json.data.paymentId}/dev-confirm`, { headers: auth });
    expect(ok.json.data.status).toBe('succeeded');
    expect(await balanceOf(user.id)).toBe(0.92);
  });

  it('addMonths прижимает день к концу месяца', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2026-10-17T10:00:00Z'), 12).toISOString()).toBe('2027-10-17T10:00:00.000Z');
  });

  describe('привязка способа оплаты и автопродление', () => {
    const HOUR = 3_600_000;
    const methodsOf = (userId: string) => prisma.paymentMethod.findMany({ where: { user_id: userId } });
    const userOf = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

    /** Пользователь с pro на месяц, оплаченным картой с автопродлением. */
    async function subscribedWithCard() {
      const { user, auth } = await createUser({ created_at: new Date('2027-06-01T00:00:00Z') });
      const res = await api('POST', '/api/payments/subscription', {
        headers: auth, body: { tier: 'pro', period: 'month', method: 'AC', autoRenew: true },
      });
      const rid = await remoteIdOf(res.json.data.paymentId);
      expect(remote.get(rid)!.request.save_payment_method).toBe(true);
      await pay(rid, { payment_method: CARD });
      return { user, auth };
    }

    it('покупка с автопродлением сохраняет карту и включает автопродление', async () => {
      const { user, auth } = await subscribedWithCard();
      const u = await userOf(user.id);
      expect(u.subscription_auto_renew).toBe(true);
      expect(u.subscription_period).toBe('month');

      const list = await api('GET', '/api/users/me/payment-methods', { headers: auth });
      expect(list.json.data).toHaveLength(1);
      expect(list.json.data[0]).toMatchObject({ last4: '4444', brand: 'mastercard', exp_year: 2030, is_default: true });
      expect(list.json.data[0].provider_method_id).toBeUndefined(); // токен наружу не отдаётся

      const cfg = await api('GET', '/api/payments/config', { headers: auth });
      expect(cfg.json.data.hasSavedMethod).toBe(true);
      expect(cfg.json.data.subscription.autoRenew).toBe(true);
    });

    it('пока автоплатежи не подключены в ЮKassa, способ не сохраняется и привязка выключена', async () => {
      delete process.env.YOOKASSA_RECURRING;
      const { auth } = await createUser();
      const res = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'AC', autoRenew: true } });
      expect(res.status).toBe(200);
      expect(remote.get(await remoteIdOf(res.json.data.paymentId))!.request.save_payment_method).toBeUndefined();
      const bind = await api('POST', '/api/payments/card-binding', { headers: auth });
      expect(bind.status).toBe(503);
      expect(bind.json.error.code).toBe('RECURRING_DISABLED');
      expect((await api('GET', '/api/payments/config', { headers: auth })).json.data.recurring).toBe(false);
    });

    it('без галочки способ не сохраняется', async () => {
      const { user, auth } = await createUser();
      const res = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'AC' } });
      const rid = await remoteIdOf(res.json.data.paymentId);
      expect(remote.get(rid)!.request.save_payment_method).toBeUndefined();
      await pay(rid, { payment_method: { ...CARD, saved: false } });
      expect(await methodsOf(user.id)).toHaveLength(0);
      expect((await userOf(user.id)).subscription_auto_renew).toBe(false);
    });

    it('привязка карты: 1 ₽ с сохранением, после оплаты возврат', async () => {
      const { user, auth } = await createUser();
      const res = await api('POST', '/api/payments/card-binding', { headers: auth });
      expect(res.status).toBe(200);
      expect(res.json.data.amount).toBe(1);
      const rid = await remoteIdOf(res.json.data.paymentId);
      expect(remote.get(rid)!.request.save_payment_method).toBe(true);

      await pay(rid, { payment_method: CARD });
      expect((await methodsOf(user.id)).map((m) => m.provider_method_id)).toEqual([CARD.id]);
      expect(refunds).toEqual([{ payment_id: rid, amount: { value: '1.00', currency: 'RUB' } }]);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: res.json.data.paymentId } })).status).toBe('refunded');

      await webhook(rid); // повтор уведомления — второго возврата нет
      expect(refunds).toHaveLength(1);
    });

    it('за сутки до конца периода списывает с карты и продлевает; повторный запуск не списывает', async () => {
      const { user } = await subscribedWithCard();
      const expires = new Date(Date.now() + 12 * HOUR);
      await prisma.user.update({ where: { id: user.id }, data: { subscription_expires_at: expires } });

      expect(await paymentsService.renewSubscriptions()).toBe(1);
      const charge = [...remote.values()].find((r) => r.request.payment_method_id)!;
      expect(charge.request.payment_method_id).toBe(CARD.id);
      expect(charge.amount.value).toBe('349.00');

      const u = await userOf(user.id);
      expect(u.subscription_expires_at!.getTime()).toBe(addMonths(expires, 1).getTime());
      expect(u.subscription_renew_attempts).toBe(0);
      const p = await prisma.payment.findFirstOrThrow({ where: { user_id: user.id, recurring: true } });
      expect(p.status).toBe('succeeded');

      expect(await paymentsService.renewSubscriptions()).toBe(0);
      expect([...remote.values()].filter((r) => r.request.payment_method_id)).toHaveLength(1);
    });

    it('без автопродления и раньше чем за сутки ничего не списывается', async () => {
      const { user } = await subscribedWithCard();
      await prisma.user.update({ where: { id: user.id }, data: { subscription_expires_at: new Date(Date.now() + 48 * HOUR) } });
      expect(await paymentsService.renewSubscriptions()).toBe(0);
      await prisma.user.update({ where: { id: user.id }, data: { subscription_expires_at: new Date(Date.now() + HOUR), subscription_auto_renew: false } });
      expect(await paymentsService.renewSubscriptions()).toBe(0);
      expect([...remote.values()].filter((r) => r.request.payment_method_id)).toHaveLength(0);
    });

    it('неудачное списание: повтор через сутки, тариф держится, после 3 попыток — выключение и free', async () => {
      const { user } = await subscribedWithCard();
      const expires = new Date(Date.now() + 12 * HOUR);
      await prisma.user.update({ where: { id: user.id }, data: { subscription_expires_at: expires } });
      chargeOutcome = { status: 'canceled', reason: 'insufficient_funds' };

      let now = new Date();
      expect(await paymentsService.renewSubscriptions(now)).toBe(0);
      expect((await userOf(user.id)).subscription_renew_attempts).toBe(1);
      expect(await paymentsService.renewSubscriptions(new Date(now.getTime() + HOUR))).toBe(0); // рано повторять
      expect((await userOf(user.id)).subscription_renew_attempts).toBe(1);

      now = new Date(now.getTime() + 25 * HOUR); // период уже кончился, но идёт льготный срок
      await paymentsService.renewSubscriptions(now);
      expect(await paymentsService.expireSubscriptions(now)).toBe(0);
      expect((await userOf(user.id)).subscription_tier).toBe('pro');

      now = new Date(now.getTime() + 25 * HOUR);
      await paymentsService.renewSubscriptions(now);
      const u = await userOf(user.id);
      expect(u.subscription_renew_attempts).toBe(3);
      expect(u.subscription_auto_renew).toBe(false);
      expect(await paymentsService.expireSubscriptions(now)).toBe(1);
      expect((await userOf(user.id)).subscription_tier).toBe('free');
      expect(await prisma.payment.count({ where: { user_id: user.id, recurring: true, status: 'expired' } })).toBe(3);
    });

    it('отзыв разрешения на списание удаляет карту и выключает автопродление', async () => {
      const { user } = await subscribedWithCard();
      await prisma.user.update({ where: { id: user.id }, data: { subscription_expires_at: new Date(Date.now() + HOUR) } });
      chargeOutcome = { status: 'canceled', reason: 'permission_revoked' };
      await paymentsService.renewSubscriptions();
      expect(await methodsOf(user.id)).toHaveLength(0);
      expect((await userOf(user.id)).subscription_auto_renew).toBe(false);
    });

    it('переключатель автопродления: нужна подписка и привязанный способ; удаление последней карты выключает', async () => {
      const { auth: noCard } = await createUser({ subscription_tier: 'pro', subscription_expires_at: new Date(Date.now() + 10 * 86_400_000) });
      const r1 = await api('PATCH', '/api/payments/auto-renew', { headers: noCard, body: { enabled: true } });
      expect(r1.status).toBe(409);
      expect(r1.json.error.code).toBe('NO_SAVED_METHOD');

      const { user, auth } = await subscribedWithCard();
      expect((await api('PATCH', '/api/payments/auto-renew', { headers: auth, body: { enabled: false } })).status).toBe(200);
      expect((await userOf(user.id)).subscription_auto_renew).toBe(false);
      expect((await api('PATCH', '/api/payments/auto-renew', { headers: auth, body: { enabled: true } })).status).toBe(200);
      expect((await userOf(user.id)).subscription_auto_renew).toBe(true);

      const [m] = await methodsOf(user.id);
      expect((await api('DELETE', `/api/users/me/payment-methods/${m.id}`, { headers: auth })).status).toBe(200);
      expect((await userOf(user.id)).subscription_auto_renew).toBe(false);
    });

    it('номер карты на наш сервер больше не принимается', async () => {
      const { auth } = await createUser();
      const res = await api('POST', '/api/users/me/payment-methods', {
        headers: auth, body: { cardNumber: '4242424242424242', expMonth: 12, expYear: 2030, holderName: 'Test' },
      });
      expect(res.status).toBe(404);
    });
  });

  describe('надёжность зачисления и журнал', () => {
    const later = () => new Date(Date.now() + 10 * 60_000);

    it('журнал: каждое изменение баланса записано, остаток сходится', async () => {
      const { user, auth } = await createUser();
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 990, method: 'AC' } });
      await pay(await remoteIdOf(res.json.data.paymentId));
      await pay(await remoteIdOf(res.json.data.paymentId)); // повтор webhook
      const sub = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'wallet' } });
      expect(sub.status).toBe(200);

      const log = await prisma.walletTransaction.findMany({ where: { user_id: user.id }, orderBy: { created_at: 'asc' } });
      expect(log.map((l) => [l.kind, Number(l.amount)])).toEqual([['topup', 10], ['subscription', -0.84]]);
      expect(log[0].ref_id).toBe(res.json.data.paymentId);
      expect(Number(log[1].balance_after)).toBe(await balanceOf(user.id));
      expect(log.reduce((s, l) => s + Number(l.amount), 0)).toBeCloseTo(await balanceOf(user.id), 2);
    });

    it('два параллельных списания на один остаток: проходит одно, баланс не уходит в минус', async () => {
      const { user, auth } = await createUser();
      await prisma.wallet.upsert({ where: { user_id: user.id }, update: { balance: 0.84 }, create: { user_id: user.id, balance: 0.84 } });
      const body = { tier: 'lite', period: 'month', method: 'wallet' };
      const rs = await Promise.all([
        api('POST', '/api/payments/subscription', { headers: auth, body }),
        api('POST', '/api/payments/subscription', { headers: auth, body }),
      ]);
      expect(rs.map((r) => r.status).sort()).toEqual([200, 402]);
      expect(await balanceOf(user.id)).toBe(0);
      expect(await prisma.walletTransaction.count({ where: { user_id: user.id } })).toBe(1);
    });

    it('платёж создан в ЮKassa, но наша запись не получила его id: webhook находит её по metadata и зачисляет', async () => {
      const { user, auth } = await createUser();
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 540, method: 'AC' } });
      const id = res.json.data.paymentId;
      const rid = await remoteIdOf(id);
      await prisma.payment.update({ where: { id }, data: { provider_operation_id: null, status: 'expired', failure_reason: 'gateway create failed' } });
      expect((await pay(rid)).statusCode).toBe(200);
      expect(await balanceOf(user.id)).toBe(5);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).provider_operation_id).toBe(rid);
    });

    it('чужой/выдуманный id в webhook ничего не меняет и не вызывает повторов', async () => {
      const { user } = await createUser();
      expect((await webhook('does-not-exist')).statusCode).toBe(200);
      expect(await balanceOf(user.id)).toBe(0);
    });

    it('webhook не пришёл: сверка по cron зачисляет оплаченный платёж один раз', async () => {
      const { user, auth } = await createUser();
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 540, method: 'AC' } });
      Object.assign(remote.get(await remoteIdOf(res.json.data.paymentId))!, { status: 'succeeded', paid: true });
      expect(await balanceOf(user.id)).toBe(0);
      await paymentsService.reconcilePayments(later());
      await paymentsService.reconcilePayments(later());
      expect(await balanceOf(user.id)).toBe(5);
      expect(await prisma.walletTransaction.count({ where: { user_id: user.id } })).toBe(1);
    });

    it('webhook не пришёл: страница возврата сама подтягивает статус', async () => {
      const { user, auth } = await createUser();
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 540, method: 'AC' } });
      Object.assign(remote.get(await remoteIdOf(res.json.data.paymentId))!, { status: 'succeeded', paid: true });
      const status = await api('GET', `/api/payments/${res.json.data.paymentId}`, { headers: auth });
      expect(status.json.data.status).toBe('succeeded');
      expect(await balanceOf(user.id)).toBe(5);
    });

    it('сверка не опрашивает повторно платежи, отменённые шлюзом', async () => {
      const { auth } = await createUser();
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 540, method: 'AC' } });
      const id = res.json.data.paymentId;
      await prisma.payment.update({ where: { id }, data: { status: 'expired' } }); // TTL
      Object.assign(remote.get(await remoteIdOf(id))!, { status: 'canceled', paid: false });
      await paymentsService.reconcilePayments(later());
      expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).failure_reason).toMatch(/^canceled/);
    });

    it('возврат проверочного 1 ₽ при привязке карты повторяется, пока не пройдёт', async () => {
      const { auth } = await createUser();
      const res = await api('POST', '/api/payments/card-binding', { headers: auth });
      const id = res.json.data.paymentId;
      refundFails = true;
      await pay(await remoteIdOf(id), { payment_method: CARD });
      expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe('succeeded'); // возврат не прошёл
      refundFails = false;
      await paymentsService.reconcilePayments(later());
      expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe('refunded');
      expect(refunds).toHaveLength(1);
    });
  });

  describe('возвраты и ручной разбор', () => {
    const refundEvent = async (rid: string, amount: string) => {
      Object.assign(remote.get(rid)!, { refunded_amount: { value: amount, currency: 'RUB' } });
      const a = await getApp();
      return a.inject({
        method: 'POST', url: '/api/payments/yookassa/notify', headers: { 'content-type': 'application/json' },
        payload: { type: 'notification', event: 'refund.succeeded', object: { id: 'rf-x', payment_id: rid } },
      });
    };
    const paidTopup = async (amount: number) => {
      const { user, auth } = await createUser();
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount, method: 'AC' } });
      const rid = await remoteIdOf(res.json.data.paymentId);
      await pay(rid);
      return { user, auth, rid, id: res.json.data.paymentId as string };
    };

    it('полный возврат пополнения списывает Blooms; повтор события ничего не меняет', async () => {
      const { user, rid, id } = await paidTopup(540);
      expect((await refundEvent(rid, '540.00')).statusCode).toBe(200);
      expect((await refundEvent(rid, '540.00')).statusCode).toBe(200);
      expect(await balanceOf(user.id)).toBe(0);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe('refunded');
      const log = await prisma.walletTransaction.findMany({ where: { user_id: user.id }, orderBy: { created_at: 'asc' } });
      expect(log.map((l) => [l.kind, Number(l.amount)])).toEqual([['topup', 5], ['refund_clawback', -5]]);
    });

    it('если Blooms уже потрачены — списывается остаток, баланс не уходит в минус, платёж помечен', async () => {
      const { user, rid, id } = await paidTopup(540);
      await prisma.wallet.update({ where: { user_id: user.id }, data: { balance: 2 } });
      await refundEvent(rid, '540.00');
      expect(await balanceOf(user.id)).toBe(0);
      const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
      expect(p.status).toBe('refunded');
      expect(p.failure_reason).toMatch(/clawed back 2 of 5/);
    });

    it('частичный возврат ничего не отзывает, а помечается для разбора', async () => {
      const { user, rid, id } = await paidTopup(540);
      await refundEvent(rid, '100.00');
      expect(await balanceOf(user.id)).toBe(5);
      const p = await prisma.payment.findUniqueOrThrow({ where: { id } });
      expect([p.status, p.failure_reason]).toEqual(['succeeded', 'partial refund 100']);
    });

    it('возврат доната снимает значок спонсора, возврат подписки выключает автопродление', async () => {
      const { user, auth } = await createUser();
      const d = await api('POST', '/api/payments/donate', { headers: auth, body: { amount: 500, method: 'AC' } });
      const drid = await remoteIdOf(d.json.data.paymentId);
      await pay(drid);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).is_sponsor).toBe(true);
      await refundEvent(drid, '500.00');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).is_sponsor).toBe(false);

      const sub = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'AC', autoRenew: true } });
      const srid = await remoteIdOf(sub.json.data.paymentId);
      await pay(srid, { payment_method: CARD });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_auto_renew).toBe(true);
      await refundEvent(srid, String(sub.json.data.amount) + '.00');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_auto_renew).toBe(false);
    });

    it('админ: review можно зачесть (платёж реально оплачен) или отклонить; обычному пользователю нельзя', async () => {
      const { user, auth } = await createUser();
      const admin = await createUser({ role: 'admin' });
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'AC' } });
      const id = res.json.data.paymentId;
      // недоплата → review
      await pay(await remoteIdOf(id), { amount: { value: '300.00', currency: 'RUB' } });
      expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe('review');

      expect((await api('POST', `/api/payments/admin/${id}/resolve`, { headers: auth, body: { action: 'approve' } })).status).toBe(403);
      expect((await api('POST', `/api/payments/admin/${id}/resolve`, { headers: admin.auth, body: { action: 'approve' } })).status).toBe(200);
      expect(await balanceOf(user.id)).toBe(2.77); // зачтено по фактической сумме 300 ₽
      expect((await api('POST', `/api/payments/admin/${id}/resolve`, { headers: admin.auth, body: { action: 'approve' } })).status).toBe(409);

      const r2 = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'AC' } });
      await pay(await remoteIdOf(r2.json.data.paymentId), { amount: { value: '10.00', currency: 'RUB' } });
      expect((await api('POST', `/api/payments/admin/${r2.json.data.paymentId}/resolve`, { headers: admin.auth, body: { action: 'reject' } })).status).toBe(200);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: r2.json.data.paymentId } })).status).toBe('expired');
      expect(await balanceOf(user.id)).toBe(2.77);
    });

    it('оплаченная подписка у пользователя с бессрочным тарифом от админа уходит на разбор, а не затирает подарок', async () => {
      const { user, auth } = await createUser();
      const res = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'AC' } });
      await prisma.user.update({ where: { id: user.id }, data: { subscription_tier: 'pro', subscription_expires_at: null } });
      await pay(await remoteIdOf(res.json.data.paymentId));
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: res.json.data.paymentId } })).status).toBe('review');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_tier).toBe('pro');
    });

    it('не больше 10 неоплаченных платежей в час', async () => {
      const { auth } = await createUser();
      for (let i = 0; i < 10; i++) {
        expect((await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 50, method: 'AC' } })).status).toBe(200);
      }
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 50, method: 'AC' } });
      expect(res.status).toBe(429);
    });
  });
});
