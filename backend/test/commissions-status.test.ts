import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { usersService } from '../src/modules/users/service.js';
import { paymentsService } from '../src/modules/payments/service.js';

const exp = (ms = 10 * 86_400_000) => new Date(Date.now() + ms);
const setStatus = (auth: Record<string, string>, commissions_status: string) =>
  api('PATCH', '/api/users/me', { headers: auth, body: { commissions_status } });
const statusOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).commissions_status;

describe('плашка «Заказы открыты»', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('Free и Lite включить не могут (402), выключить — могут', async () => {
    for (const tier of ['free', 'lite']) {
      const u = await createUser({ subscription_tier: tier, subscription_expires_at: tier === 'free' ? null : exp() });
      const res = await setStatus(u.auth, 'open');
      expect(res.status).toBe(402);
      expect(await statusOf(u.user.id)).toBe('none');
      expect((await setStatus(u.auth, 'none')).status).toBe(200);
    }
  });

  it('Pro и Business включают все три статуса, профиль отдаёт значение', async () => {
    for (const tier of ['pro', 'business']) {
      const u = await createUser({ subscription_tier: tier, subscription_expires_at: exp() });
      for (const st of ['open', 'waitlist', 'closed']) {
        const res = await setStatus(u.auth, st);
        expect(res.status).toBe(200);
        expect(res.json.data.user?.commissions_status ?? res.json.data.commissions_status).toBe(st);
      }
      const pub = await api('GET', `/api/users/${u.user.id}`);
      expect((pub.json.data.user ?? pub.json.data).commissions_status).toBe('closed');
    }
  });

  it('неизвестный статус отклоняется схемой', async () => {
    const u = await createUser({ subscription_tier: 'pro', subscription_expires_at: exp() });
    expect((await setStatus(u.auth, 'maybe')).status).toBe(400);
  });

  it('когда оплаченный период кончился, плашка гаснет', async () => {
    const u = await createUser({ subscription_tier: 'pro', subscription_expires_at: exp() });
    await setStatus(u.auth, 'open');
    await prisma.user.update({ where: { id: u.user.id }, data: { subscription_expires_at: new Date(Date.now() - 1000) } });
    await paymentsService.expireSubscriptions();
    expect(await statusOf(u.user.id)).toBe('none');
  });

  it('ручная смена тарифа на Lite или Free (админ) гасит плашку, на Business — нет', async () => {
    const u = await createUser({ subscription_tier: 'pro', subscription_expires_at: exp() });
    await setStatus(u.auth, 'open');
    await usersService.updateSubscriptionTier(u.user.id, 'business', { skipPaymentCheck: true });
    expect(await statusOf(u.user.id)).toBe('open');
    await usersService.updateSubscriptionTier(u.user.id, 'lite', { skipPaymentCheck: true });
    expect(await statusOf(u.user.id)).toBe('none');
  });

  it('понижение тарифа покупкой Lite при действующем Pro тоже гасит плашку', async () => {
    const u = await createUser({ subscription_tier: 'pro', subscription_expires_at: exp(), created_at: new Date('2027-06-01T00:00:00Z') });
    await prisma.wallet.create({ data: { user_id: u.user.id, balance: 10 } });
    await prisma.blmRate.create({ data: { usd_rub: 90 } });
    await setStatus(u.auth, 'waitlist');
    const res = await api('POST', '/api/payments/subscription', { headers: u.auth, body: { tier: 'lite', period: 'month', method: 'wallet' } });
    expect(res.status).toBe(200);
    expect(await statusOf(u.user.id)).toBe('none');
  });

  it('автор поста и результаты поиска несут статус для плашки', async () => {
    const u = await createUser({ username: 'artistx', subscription_tier: 'pro', subscription_expires_at: exp() });
    await setStatus(u.auth, 'open');
    await prisma.post.create({ data: { author_id: u.user.id, content: 'hello' } });
    const feed = await api('GET', '/api/posts');
    expect(feed.json.data.posts[0].author.commissions_status).toBe('open');
    const viewer = await createUser();
    const found = await api('GET', '/api/users/search?q=artistx', { headers: viewer.auth });
    expect(found.json.data.users[0].commissions_status).toBe('open');
  });
});
