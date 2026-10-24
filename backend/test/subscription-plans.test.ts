import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { quote, monthlyPriceBlm, PURCHASABLE_TIERS } from '../src/modules/payments/pricing.js';
import { PLAN_PERKS, perksFor } from '../src/modules/payments/plan-perks.js';

const LATE = new Date('2027-06-01T00:00:00Z'); // без скидки ранних
const EARLY = new Date('2026-06-01T00:00:00Z');

describe('тарифы: цены в BLM', () => {
  it('обычные цены 2 / 4 / 10 BLM в месяц, ранним — вдвое меньше (1 / 2 / 5)', () => {
    expect(['lite', 'pro', 'business'].map((t) => monthlyPriceBlm(t as any, 'month', false))).toEqual([2, 4, 10]);
    expect(['lite', 'pro', 'business'].map((t) => monthlyPriceBlm(t as any, 'month', true))).toEqual([1, 2, 5]);
  });

  it('год: −25 % к месяцу, ранним ещё −50 %; суммы без float-хвостов', () => {
    expect(quote('lite', 'year', false, 90)).toMatchObject({ blmPerMonth: 1.5, blmAmount: 18, amount: 1620 });
    expect(quote('business', 'year', true, 90)).toMatchObject({ blmPerMonth: 3.75, blmAmount: 45, amount: 4050 });
    expect(quote('lite', 'year', true, 90).blmAmount).toBe(9);
  });

  it('на шлюз уходит рублёвый эквивалент по курсу вверх до целого, с баланса — ровно BLM', () => {
    const q = quote('lite', 'month', true, 81.13);
    expect(q.blmAmount).toBe(1);
    expect(q.amount).toBe(82);
    expect(q.bcAmount).toBe(1);
  });

  it('продаются все три платных тарифа', () => {
    expect(PURCHASABLE_TIERS).toEqual(['lite', 'pro', 'business']);
  });
});

describe('тарифы: перки', () => {
  it('комиссия вывода 3 / 3 / 2 / 1 %, внутри групп 0 % на всех', () => {
    expect(['free', 'lite', 'pro', 'business'].map((t) => perksFor(t).withdrawFeePct)).toEqual([3, 3, 2, 1]);
    expect(Object.values(PLAN_PERKS).every((p) => p.groupSalesFeePct === 0)).toBe(true);
  });

  it('скидки на баннеры Pro 15 %, Business 30 %; кэшбэк и бусты только у Business', () => {
    expect(perksFor('pro').adDiscountPct).toBe(15);
    expect(perksFor('business')).toMatchObject({ adDiscountPct: 30, promoCashbackBlm: 2, autoBump: true });
    expect(perksFor('pro')).toMatchObject({ freeBumpsPerMonth: 3, autoBump: false, promoCashbackBlm: 0 });
  });

  it('неизвестный тариф считается free', () => {
    expect(perksFor('god')).toEqual(PLAN_PERKS.free);
  });
});

describe('тарифы: оплата с баланса и конфиг', () => {
  beforeAll(() => getApp());
  beforeEach(async () => {
    await resetDb();
    await prisma.blmRate.create({ data: { usd_rub: 90 } });
  });
  const buy = (auth: Record<string, string>, tier: string, period = 'month') =>
    api('POST', '/api/payments/subscription', { headers: auth, body: { tier, period, method: 'wallet' } });
  const balance = async (id: string) => Number((await prisma.wallet.findUniqueOrThrow({ where: { user_id: id } })).balance);

  it('Business покупается с баланса за 10 BLM', async () => {
    const { user, auth } = await createUser({ created_at: LATE });
    await prisma.wallet.create({ data: { user_id: user.id, balance: 12 } });
    const res = await buy(auth, 'business');
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_tier).toBe('business');
    expect(await balance(user.id)).toBe(2);
    const p = await prisma.payment.findFirstOrThrow({ where: { user_id: user.id } });
    expect([Number(p.blm_amount), Number(p.amount)]).toEqual([10, 900]);
  });

  it('ранний пользователь платит за Business 5 BLM, за годовой Lite — 9 BLM', async () => {
    const { user, auth } = await createUser({ created_at: EARLY });
    await prisma.wallet.create({ data: { user_id: user.id, balance: 20 } });
    expect((await buy(auth, 'business')).status).toBe(200);
    expect(await balance(user.id)).toBe(15);
    expect((await buy(auth, 'lite', 'year')).status).toBe(200);
    expect(await balance(user.id)).toBe(6);
  });

  it('не хватает BLM — 402, подписка не выдана, баланс цел', async () => {
    const { user, auth } = await createUser({ created_at: LATE });
    await prisma.wallet.create({ data: { user_id: user.id, balance: 9.99 } });
    const res = await buy(auth, 'business');
    expect(res.status).toBe(402);
    expect(await balance(user.id)).toBe(9.99);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_tier).toBe('free');
  });

  it('промо-баланс на подписку не тратится', async () => {
    const { user, auth } = await createUser({ created_at: LATE });
    await prisma.wallet.create({ data: { user_id: user.id, balance: 1, promo_balance: 50 } });
    expect((await buy(auth, 'lite')).status).toBe(402);
  });

  it('апгрейд Lite → Pro: остаток Lite пересчитывается по соотношению цен (2 / 4 BLM)', async () => {
    const { user, auth } = await createUser({ created_at: LATE });
    await prisma.wallet.create({ data: { user_id: user.id, balance: 20 } });
    await buy(auth, 'lite');
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_expires_at!;
    const remainingDays = (before.getTime() - Date.now()) / 86_400_000;
    await buy(auth, 'pro');
    const after = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).subscription_expires_at!;
    const days = (after.getTime() - Date.now()) / 86_400_000;
    expect(days - 30).toBeGreaterThan(remainingDays / 2 - 2);
    expect(days - 30).toBeLessThan(remainingDays / 2 + 2);
  });

  it('конфиг отдаёт цены в BLM и рублях, перки тарифов и признак раннего пользователя', async () => {
    const { auth } = await createUser({ created_at: EARLY });
    const res = await api('GET', '/api/payments/config', { headers: auth });
    const d = res.json.data;
    expect(d.earlyUser).toBe(true);
    expect(d.plans.map((p: any) => p.tier)).toEqual(['lite', 'pro', 'business']);
    expect(d.plans[2].month).toMatchObject({ blmAmount: 5, amount: 450, discounted: true });
    expect(d.perks.business.withdrawFeePct).toBe(1);
    expect(d.perks.free.denCooldownHours).toBe(3);
  });
});
