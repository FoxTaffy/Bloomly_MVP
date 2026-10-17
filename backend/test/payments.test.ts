import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createHash } from 'crypto';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { paymentsService, addMonths } from '../src/modules/payments/service.js';

const SECRET = 'test-yoomoney-secret';

/** Уведомление ЮMoney с корректной подписью (как его шлёт шлюз). */
function notification(label: string, amount: number, over: Record<string, string> = {}) {
  const n: Record<string, string> = {
    notification_type: 'card-incoming',
    operation_id: `op-${Math.random().toString(36).slice(2)}`,
    amount: (amount * 0.97).toFixed(2),
    withdraw_amount: amount.toFixed(2),
    currency: '643',
    datetime: '2026-10-17T12:00:00Z',
    sender: '',
    codepro: 'false',
    label,
    unaccepted: 'false',
    ...over,
  };
  const str = [n.notification_type, n.operation_id, n.amount, n.currency, n.datetime, n.sender, n.codepro, SECRET, n.label].join('&');
  n.sha1_hash = over.sha1_hash ?? createHash('sha1').update(str).digest('hex');
  return n;
}

async function notify(n: Record<string, string>) {
  const a = await getApp();
  return a.inject({
    method: 'POST', url: '/api/payments/yoomoney/notify',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(n).toString(),
  });
}

const balanceOf = async (userId: string) =>
  Number((await prisma.wallet.findUnique({ where: { user_id: userId } }))?.balance ?? 0);

describe('payments: ЮMoney', () => {
  beforeAll(() => getApp());
  beforeEach(async () => {
    await resetDb();
    process.env.YOOMONEY_RECEIVER = '4100000000000000';
    process.env.YOOMONEY_NOTIFICATION_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.YOOMONEY_RECEIVER;
    delete process.env.YOOMONEY_NOTIFICATION_SECRET;
  });

  it('два одновременных платежа за подписку суммируют оба периода', async () => {
    const { user, auth } = await createUser({ created_at: new Date('2027-06-01T00:00:00Z') });
    const body = { tier: 'lite', period: 'month', method: 'AC' };
    const first = await api('POST', '/api/payments/subscription', { headers: auth, body });
    const second = await api('POST', '/api/payments/subscription', { headers: auth, body });
    const results = await Promise.all([
      notify(notification(first.json.data.paymentId, 149)),
      notify(notification(second.json.data.paymentId, 149)),
    ]);
    expect(results.map(result => result.statusCode)).toEqual([200, 200]);
    const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const days = (account.subscription_expires_at!.getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(55);
    expect(days).toBeLessThan(63);
  });

  it('без ключей оплата через шлюз выключена', async () => {
    delete process.env.YOOMONEY_RECEIVER;
    const { auth } = await createUser();
    const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 100, method: 'AC' } });
    expect(res.status).toBe(503);
    expect(res.json.error.code).toBe('PAYMENTS_DISABLED');
    const cfg = await api('GET', '/api/payments/config', { headers: auth });
    expect(cfg.json.data.enabled).toBe(false);
  });

  it('пополнение: ссылка на форму, зачисление по уведомлению, повтор не зачисляет дважды', async () => {
    const { user, auth } = await createUser();
    const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'AC' } });
    expect(res.status).toBe(200);
    const { paymentId, confirmationUrl } = res.json.data;
    const url = new URL(confirmationUrl);
    expect(url.searchParams.get('receiver')).toBe('4100000000000000');
    expect(url.searchParams.get('label')).toBe(paymentId);
    expect(url.searchParams.get('sum')).toBe('500.00');
    expect(url.searchParams.get('paymentType')).toBe('AC');

    const n = notification(paymentId, 500);
    expect((await notify(n)).statusCode).toBe(200);
    expect((await notify(n)).statusCode).toBe(200);
    expect(await balanceOf(user.id)).toBe(500); // зачисляется запрошенная сумма, комиссия — на получателе

    const status = await api('GET', `/api/payments/${paymentId}`, { headers: auth });
    expect(status.json.data.status).toBe('succeeded');
  });

  it('неверная подпись → 403, ничего не зачислено', async () => {
    const { user, auth } = await createUser();
    const { json } = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'AC' } });
    const res = await notify(notification(json.data.paymentId, 500, { sha1_hash: 'a'.repeat(40) }));
    expect(res.statusCode).toBe(403);
    expect(await balanceOf(user.id)).toBe(0);
  });

  it('оплачено меньше ожидаемого или деньги заморожены → review без зачисления', async () => {
    const { user, auth } = await createUser();
    const a = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'AC' } });
    expect((await notify(notification(a.json.data.paymentId, 50))).statusCode).toBe(200);
    const b = await api('POST', '/api/payments/topup', { headers: auth, body: { amount: 500, method: 'PC' } });
    expect((await notify(notification(b.json.data.paymentId, 500, { unaccepted: 'true' }))).statusCode).toBe(200);

    expect(await balanceOf(user.id)).toBe(0);
    const rows = await prisma.payment.findMany({ where: { user_id: user.id } });
    expect(rows.map((r) => r.status)).toEqual(['review', 'review']);
  });

  it('сумма пополнения проверяется на сервере', async () => {
    const { auth } = await createUser();
    for (const amount of [10, 100.5, 1_000_000, 'abc']) {
      const res = await api('POST', '/api/payments/topup', { headers: auth, body: { amount, method: 'AC' } });
      expect(res.status).toBe(400);
    }
  });

  it('подписка: цену считает сервер, после оплаты тариф выдаётся на период', async () => {
    const { user, auth } = await createUser({ created_at: new Date('2027-06-01T00:00:00Z') });
    const res = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'pro', period: 'year', method: 'AC' } });
    expect(res.status).toBe(200);
    expect(res.json.data.amount).toBe(249 * 12);

    await notify(notification(res.json.data.paymentId, 249 * 12));
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
    await prisma.wallet.create({ data: { user_id: user.id, balance: 400 } });

    const first = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'wallet' } });
    expect(first.status).toBe(200);
    expect(first.json.data.status).toBe('succeeded');
    const exp1 = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_expires_at!;

    const second = await api('POST', '/api/payments/subscription', { headers: auth, body: { tier: 'lite', period: 'month', method: 'wallet' } });
    expect(second.status).toBe(200);
    const exp2 = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_expires_at!;
    expect(exp2.getTime()).toBe(addMonths(exp1, 1).getTime()); // продлено от конца периода, а не от «сейчас»
    expect(await balanceOf(user.id)).toBe(400 - 149 * 2);

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
    expect(await balanceOf(user.id)).toBe(100);
  });

  it('addMonths прижимает день к концу месяца', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2026-10-17T10:00:00Z'), 12).toISOString()).toBe('2027-10-17T10:00:00.000Z');
  });
});
