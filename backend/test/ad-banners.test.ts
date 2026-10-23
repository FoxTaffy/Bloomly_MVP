import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { adQuote } from '../src/modules/ads/ads.config.js';

const DAY = 86_400_000;

async function buyer(tier = 'free', balance = 50, promo = 0) {
  const u = await createUser({ subscription_tier: tier, subscription_expires_at: tier === 'free' ? null : new Date(Date.now() + 10 * DAY) });
  await prisma.wallet.create({ data: { user_id: u.user.id, balance, promo_balance: promo } });
  return u;
}
const wallet = async (id: string) => {
  const w = await prisma.wallet.findUniqueOrThrow({ where: { user_id: id } });
  return { balance: Number(w.balance), promo: Number(w.promo_balance) };
};
const order = (auth: Record<string, string>, over: Record<string, unknown> = {}) =>
  api('POST', '/api/admin/ads', {
    headers: auth,
    body: { title: 'Моя выставка', linkUrl: 'https://example.com/expo', placement: 'feed_top', billing: 'week', periods: 1, ...over },
  });
const review = (admin: { auth: Record<string, string> }, id: string, status: 'active' | 'rejected', body: Record<string, unknown> = {}) =>
  api('PATCH', `/api/admin/ads/${id}/review`, { headers: admin.auth, body: { status, ...body } });

describe('баннеры: расчёт цены', () => {
  it('скидки тарифа: Pro −15 %, Business −30 %, округление вверх до сотых', () => {
    expect(adQuote('feed_top', 'week', 1, 0).price).toBe(16);
    expect(adQuote('feed_top', 'week', 1, 15).price).toBe(13.6);
    expect(adQuote('feed_top', 'week', 1, 30).price).toBe(11.2);
    expect(adQuote('left_menu', 'day', 1, 15).price).toBe(1.7);
    expect(adQuote('feed_top', 'day', 1, 15).price).toBe(2.98); // 2.975 → вверх
    expect(adQuote('groups_page', 'day', 3, 30)).toMatchObject({ base: 9, price: 6.3, durationDays: 3 });
    expect(adQuote('right_column', 'week', 2, 0)).toMatchObject({ price: 14, durationDays: 14 });
  });
});

describe('баннеры: покупка за BLM', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('прайс: скидка зависит от тарифа, нужна авторизация', async () => {
    expect((await api('GET', '/api/admin/ads/pricing')).status).toBe(401);
    for (const [tier, pct] of [['free', 0], ['lite', 0], ['pro', 15], ['business', 30]] as const) {
      const u = await buyer(tier, 5, 3);
      const res = await api('GET', '/api/admin/ads/pricing', { headers: u.auth });
      expect(res.json.data).toMatchObject({ discountPct: pct, balance: 5, promoBalance: 3 });
      expect(res.json.data.placements.map((p: any) => p.placement)).toEqual(['feed_top', 'groups_page', 'left_menu', 'right_column']);
    }
  });

  it('Free покупает неделю в верху ленты за 16 BLM: деньги списаны, заявка ждёт модерации', async () => {
    const u = await buyer('free', 20);
    const res = await order(u.auth);
    expect(res.status).toBe(201);
    expect(res.json.data.quote).toMatchObject({ price: 16, discountPct: 0, durationDays: 7 });
    expect(await wallet(u.user.id)).toEqual({ balance: 4, promo: 0 });
    const ad = await prisma.advertisement.findUniqueOrThrow({ where: { id: res.json.data.ad.id } });
    expect(ad).toMatchObject({ status: 'pending', placement: 'feed_top', billing: 'week', periods: 1, duration_days: 7, requester_id: u.user.id });
    expect([Number(ad.price_blm), Number(ad.paid_main_blm), Number(ad.paid_promo_blm)]).toEqual([16, 16, 0]);
    const log = await prisma.walletTransaction.findMany({ where: { user_id: u.user.id } });
    expect(log).toMatchObject([{ kind: 'ad_banner', ref_id: ad.id, balance_type: 'main' }]);
  });

  it('скидка применяется автоматически: Pro 13.6, Business 11.2, Lite без скидки', async () => {
    const prices: Record<string, number> = {};
    for (const tier of ['lite', 'pro', 'business']) {
      const u = await buyer(tier, 20);
      const res = await order(u.auth);
      expect(res.status).toBe(201);
      prices[tier] = Number(res.json.data.ad.price_blm);
      expect((await wallet(u.user.id)).balance).toBeCloseTo(20 - prices[tier], 2);
    }
    expect(prices).toEqual({ lite: 16, pro: 13.6, business: 11.2 });
  });

  it('промо-баланс тратится первым, остаток — с основного', async () => {
    const u = await buyer('free', 10, 5);
    const res = await order(u.auth, { placement: 'right_column' }); // 7 BLM
    expect(res.status).toBe(201);
    expect(await wallet(u.user.id)).toEqual({ balance: 8, promo: 0 });
    const ad = await prisma.advertisement.findUniqueOrThrow({ where: { id: res.json.data.ad.id } });
    expect([Number(ad.paid_promo_blm), Number(ad.paid_main_blm)]).toEqual([5, 2]);
  });

  it('не хватает BLM — 402 INSUFFICIENT_FUNDS, заявки нет, баланс цел', async () => {
    const u = await buyer('free', 3, 2);
    const res = await order(u.auth);
    expect(res.status).toBe(402);
    expect(res.json.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await prisma.advertisement.count()).toBe(0);
    expect(await wallet(u.user.id)).toEqual({ balance: 3, promo: 2 });
  });

  it('неверное место, тариф, срок и ссылка отклоняются без списания', async () => {
    const u = await buyer('free', 100);
    for (const over of [{ placement: 'footer' }, { billing: 'year' }, { periods: 0 }, { periods: 13 }, { periods: 1.5 }, { linkUrl: 'javascript:alert(1)' }, { placement: undefined }]) {
      expect((await order(u.auth, over)).status).toBe(400);
    }
    expect((await order(u.auth, { billing: 'day', periods: 31 })).status).toBe(400);
    expect(await prisma.advertisement.count()).toBe(0);
    expect(await wallet(u.user.id)).toEqual({ balance: 100, promo: 0 });
  });

  it('параллельные заказы не уводят баланс в минус', async () => {
    const u = await buyer('free', 20);
    const results = await Promise.all(Array.from({ length: 3 }, () => order(u.auth)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 402)).toHaveLength(2);
    expect(await prisma.advertisement.count()).toBe(1);
    expect((await wallet(u.user.id)).balance).toBe(4);
  });
});

describe('баннеры: модерация, возврат и показ', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);
  const admin = () => createUser({ role: 'admin' });

  it('одобрение запускает срок с момента одобрения', async () => {
    const u = await buyer('free', 50);
    const ad = (await order(u.auth, { billing: 'day', periods: 3, placement: 'left_menu' })).json.data.ad;
    const res = await review(await admin(), ad.id, 'active');
    expect(res.status).toBe(200);
    const row = await prisma.advertisement.findUniqueOrThrow({ where: { id: ad.id } });
    expect(row.status).toBe('active');
    expect(row.ends_at!.getTime() - row.starts_at!.getTime()).toBe(3 * DAY);
    expect(Math.abs(row.starts_at!.getTime() - Date.now())).toBeLessThan(10_000);
    expect(row.refunded_at).toBeNull();
  });

  it('отказ возвращает деньги в те же балансы, повторный отказ не возвращает второй раз', async () => {
    const u = await buyer('free', 10, 5);
    const ad = (await order(u.auth, { placement: 'right_column' })).json.data.ad; // 5 промо + 2 основных
    const a = await admin();
    expect((await review(a, ad.id, 'rejected')).status).toBe(200);
    expect(await wallet(u.user.id)).toEqual({ balance: 10, promo: 5 });
    await review(a, ad.id, 'rejected');
    expect(await wallet(u.user.id)).toEqual({ balance: 10, promo: 5 });
    const kinds = (await prisma.walletTransaction.findMany({ where: { user_id: u.user.id, kind: 'ad_refund' } })).map((t) => t.balance_type).sort();
    expect(kinds).toEqual(['main', 'promo']);
  });

  it('одобренную и показанную рекламу последующий отказ автоматически не возвращает', async () => {
    const u = await buyer('free', 20);
    const ad = (await order(u.auth)).json.data.ad;
    const a = await admin();
    await review(a, ad.id, 'active');
    await review(a, ad.id, 'rejected');
    expect(await wallet(u.user.id)).toEqual({ balance: 4, promo: 0 });
  });

  it('удаление непоказанной заявки возвращает деньги', async () => {
    const u = await buyer('free', 20);
    const ad = (await order(u.auth)).json.data.ad;
    const res = await api('DELETE', `/api/admin/ads/${ad.id}`, { headers: (await admin()).auth });
    expect(res.status).toBe(200);
    expect(await wallet(u.user.id)).toEqual({ balance: 20, promo: 0 });
  });

  it('публично отдаются только одобренные и не истёкшие, и только поля для показа', async () => {
    const u = await buyer('free', 100);
    const a = await admin();
    const live = (await order(u.auth, { contactInfo: '@secret' })).json.data.ad;
    const pending = (await order(u.auth, { placement: 'left_menu' })).json.data.ad;
    const expired = (await order(u.auth, { placement: 'groups_page' })).json.data.ad;
    await review(a, live.id, 'active');
    await review(a, expired.id, 'active', { startsAt: new Date(Date.now() - 10 * DAY).toISOString(), endsAt: new Date(Date.now() - DAY).toISOString() });
    const res = await api('GET', '/api/admin/ads/active');
    const ads = res.json.data.ads;
    expect(ads.map((x: any) => x.id)).toEqual([live.id]);
    expect(ads[0].placement).toBe('feed_top');
    expect(Object.keys(ads[0]).sort()).toEqual(['description', 'ends_at', 'id', 'image_url', 'link_url', 'placement', 'starts_at', 'title']);
    expect(pending.id).not.toBe(live.id);
  });

  it('обычному пользователю решение модератора недоступно', async () => {
    const u = await buyer('free', 20);
    const ad = (await order(u.auth)).json.data.ad;
    const res = await api('PATCH', `/api/admin/ads/${ad.id}/review`, { headers: u.auth, body: { status: 'active' } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await prisma.advertisement.findUniqueOrThrow({ where: { id: ad.id } })).status).toBe('pending');
  });
});

describe('служебная реклама админа', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('создаётся бесплатно, сразу активна на выбранный срок; обычному пользователю недоступна', async () => {
    const staff = await createUser({ role: 'admin' });
    const body = { title: 'От команды', linkUrl: 'https://example.com/news', placement: 'left_menu', days: 3 };
    const res = await api('POST', '/api/admin/ads/staff', { headers: staff.auth, body });
    expect(res.status, JSON.stringify(res.json)).toBe(201);
    const ad = res.json.data.ad;
    expect(ad).toMatchObject({ status: 'active', placement: 'left_menu', duration_days: 3, price_blm: null });
    expect(new Date(ad.ends_at).getTime() - new Date(ad.starts_at).getTime()).toBe(3 * DAY);

    const bad = await api('POST', '/api/admin/ads/staff', { headers: staff.auth, body: { ...body, placement: 'nowhere' } });
    expect(bad.status).toBe(400);
    const user = await createUser();
    expect((await api('POST', '/api/admin/ads/staff', { headers: user.auth, body })).status).toBe(403);
  });
});
