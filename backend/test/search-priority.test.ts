import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { searchScore } from '../src/lib/searchRank.js';

const exp = () => new Date(Date.now() + 10 * 86_400_000);
const mk = (username: string, tier: string, over: Record<string, unknown> = {}) =>
  createUser({ username, subscription_tier: tier, subscription_expires_at: tier === 'free' ? null : exp(), ...over });

describe('приоритет в поиске: расчёт оценки', () => {
  it('Business > Pro > Free при равной релевантности; Lite приоритета не получает', () => {
    expect(searchScore(7, 1, 'business')).toBeGreaterThan(searchScore(7, 1, 'pro'));
    expect(searchScore(7, 1, 'pro')).toBeGreaterThan(searchScore(7, 1, 'free'));
    expect(searchScore(7, 1, 'lite')).toBe(searchScore(7, 1, 'free'));
  });

  it('точное совпадение у Free впереди неточного у Business', () => {
    expect(searchScore(10, 1, 'free')).toBeGreaterThan(searchScore(7, 1, 'business'));
    expect(searchScore(10, 1, 'free')).toBeGreaterThan(searchScore(3, 1, 'business'));
  });

  it('точные совпадения между собой тоже упорядочены тарифом', () => {
    expect(searchScore(10, 1, 'business')).toBeGreaterThan(searchScore(10, 1, 'pro'));
    expect(searchScore(10, 1, 'pro')).toBeGreaterThan(searchScore(10, 1, 'free'));
  });
});

describe('приоритет в поиске: люди', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('авторы с Business и Pro идут выше среди похожих совпадений, точный ник остаётся первым', async () => {
    await mk('luna_free2', 'free');
    await mk('luna_lite', 'lite');
    await mk('luna_pro', 'pro');
    await mk('luna_biz', 'business');
    await mk('luna', 'free');
    const viewer = await createUser();
    const res = await api('GET', '/api/users/search?q=luna', { headers: viewer.auth });
    const names = res.json.data.users.map((u: any) => u.username);
    expect(names.slice(0, 3)).toEqual(['luna', 'luna_biz', 'luna_pro']);
    expect(names.slice(3).sort()).toEqual(['luna_free2', 'luna_lite']);
  });

  it('истёкший тариф приоритета не даёт: пользователь вернулся в free', async () => {
    const early = await mk('fox_a', 'pro');
    await mk('fox_b', 'free');
    await prisma.user.update({ where: { id: early.user.id }, data: { subscription_expires_at: new Date(Date.now() - 1000) } });
    const { paymentsService } = await import('../src/modules/payments/service.js');
    await paymentsService.expireSubscriptions();
    const viewer = await createUser();
    const res = await api('GET', '/api/users/search?q=fox', { headers: viewer.auth });
    // оба free — прежний порядок: новые выше
    expect(res.json.data.users.map((u: any) => u.username)).toEqual(['fox_b', 'fox_a']);
  });
});

describe('приоритет в поиске: группы', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);
  const group = (ownerId: string, name: string, slug: string) =>
    prisma.group.create({ data: { owner_id: ownerId, name, slug, type: 'static', is_public: true, members_count: 3 } });

  it('группа владельца Business выше группы владельца Free при равном совпадении', async () => {
    const free = await mk('o_free', 'free');
    const biz = await mk('o_biz', 'business');
    const pro = await mk('o_pro', 'pro');
    await group(free.user.id, 'Лисья мастерская', 'lis-a');
    await group(pro.user.id, 'Лисья студия', 'lis-b');
    await group(biz.user.id, 'Лисья артель', 'lis-c');
    const res = await api('GET', '/api/groups/search?q=Лисья');
    expect(res.json.data.groups.map((g: any) => g.slug)).toEqual(['lis-c', 'lis-b', 'lis-a']);
    expect(res.json.data.groups[0].owner_id).toBeUndefined(); // служебное поле наружу не уходит
  });

  it('точное название у Free выше неточных у Business', async () => {
    const free = await mk('o_free', 'free');
    const biz = await mk('o_biz', 'business');
    await group(biz.user.id, 'Лисья артель', 'lis-c');
    await group(free.user.id, 'Лис', 'lis-exact');
    const res = await api('GET', '/api/groups/search?q=Лис');
    expect(res.json.data.groups[0].slug).toBe('lis-exact');
  });
});

describe('приоритет в поиске: лоты Dealers Den', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);
  const lot = async (sellerId: string, title: string, ageMin: number) => {
    const t = new Date(Date.now() - ageMin * 60_000);
    return prisma.dealerListing.create({
      data: { seller_id: sellerId, title, price: 5, currency: 'USD', status: 'active', feed_published_at: t, feed_at: t, created_at: t } as any,
    });
  };

  it('лот продавца Business/Pro выше при равном совпадении названия, точное название у Free впереди', async () => {
    const free = await mk('s_free', 'free');
    const pro = await mk('s_pro', 'pro');
    const biz = await mk('s_biz', 'business');
    const a = await lot(free.user.id, 'Значок ручной работы', 1); // самый свежий
    const b = await lot(pro.user.id, 'Значок ручной работы', 2);
    const c = await lot(biz.user.id, 'Значок ручной работы', 3);
    const exact = await lot(free.user.id, 'Значок', 4);
    const res = await api('GET', '/api/dealers-den?search=' + encodeURIComponent('Значок'));
    expect(res.json.data.listings.map((l: any) => l.id)).toEqual([exact.id, c.id, b.id, a.id]);
  });

  it('без поискового запроса порядок прежний — по свежести ленты', async () => {
    const free = await mk('s_free', 'free');
    const biz = await mk('s_biz', 'business');
    const newer = await lot(free.user.id, 'Новый', 1);
    const older = await lot(biz.user.id, 'Старый', 10);
    const res = await api('GET', '/api/dealers-den');
    expect(res.json.data.listings.map((l: any) => l.id)).toEqual([newer.id, older.id]);
    void randomUUID;
  });
});
