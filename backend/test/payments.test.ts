import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { paymentsService, addMonths } from '../src/modules/payments/service.js';

// ЮKassa подменяется через fetch: «магазин» хранит созданные платежи и отдаёт их по GET.
type Remote = { id: string; status: string; paid: boolean; amount: { value: string; currency: string }; income_amount: { value: string; currency: string }; metadata: Record<string, string>; confirmation: { type: string; confirmation_url: string } };
const remote = new Map<string, Remote>();
let seq = 0;
const realFetch = globalThis.fetch;

function mockYookassa() {
  remote.clear();
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (!u.startsWith('https://api.yookassa.ru/v3')) return realFetch(url, init);
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const id = `yk-${++seq}`;
      const r: Remote = {
        id, status: 'pending', paid: false, amount: body.amount,
        income_amount: { value: (Number(body.amount.value) * 0.97).toFixed(2), currency: 'RUB' },
        metadata: body.metadata,
        confirmation: { type: 'redirect', confirmation_url: `https://yoomoney.ru/checkout/${id}` },
      };
      remote.set(id, r);
      return json(r);
    }
    return json(remote.get(u.split('/').pop()!));
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
    mockYookassa();
  });
  afterEach(() => {
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
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

  it('донат: сумма проверяется, после оплаты платёж succeeded и ничего не выдаётся', async () => {
    const { user, auth } = await createUser();
    for (const amount of [5, 100.5, 10_000_000, 'abc']) {
      expect((await api('POST', '/api/payments/donate', { headers: auth, body: { amount, method: 'AC' } })).status).toBe(400);
    }
    const res = await api('POST', '/api/payments/donate', { headers: auth, body: { amount: 300, method: 'PC' } });
    expect(res.status).toBe(200);
    await pay(await remoteIdOf(res.json.data.paymentId));
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: res.json.data.paymentId } });
    expect(p.status).toBe('succeeded');
    expect(p.purpose).toBe('donation');
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
});
