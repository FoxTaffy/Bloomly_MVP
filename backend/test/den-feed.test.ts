import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';
import { dealersDenService } from '../src/modules/dealers-den/service.js';
import { publishQueuedListings, runAutoBumps } from '../src/modules/dealers-den/feed.service.js';
import { creditPromo } from '../src/modules/wallet/ledger.js';

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR);

async function seller(tier = 'free') {
  const u = await createUser({ is_verified: true, verification_type: 'artist', subscription_tier: tier });
  const group = await prisma.group.create({ data: { owner_id: u.user.id, name: 'Shop', slug: `g-${randomUUID().slice(0, 8)}`, type: 'static' } });
  return { ...u, group };
}
const post = (s: { user: { id: string }; group: { id: string } }, title = 'Lot', over: Record<string, unknown> = {}) =>
  dealersDenService.create(s.user.id, { groupId: s.group.id, title, price: 5, ...over } as any);
const feedIds = async () => (await api('GET', '/api/dealers-den')).json.data.listings.map((l: any) => l.id);
const row = (id: string) => prisma.dealerListing.findUniqueOrThrow({ where: { id } });

describe('den feed: кулдаун публикации', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('первая карточка сразу в общей ленте, вторая за кулдауном ждёт в очереди', async () => {
    const s = await seller();
    const a = await post(s, 'A');
    const b = await post(s, 'B');
    expect((await row(a.id)).feed_published_at).not.toBeNull();
    expect((await row(b.id)).feed_published_at).toBeNull();
    expect(await feedIds()).toEqual([a.id]);
  });

  it('очередь видна в магазине группы и у продавца, но не в общей ленте', async () => {
    const s = await seller();
    await post(s, 'A');
    const b = await post(s, 'B');
    const shop = await api('GET', `/api/dealers-den?groupId=${s.group.id}`);
    expect(shop.json.data.listings.map((l: any) => l.id)).toContain(b.id);
    expect(shop.json.data.listings).toHaveLength(2);
    expect(await feedIds()).not.toContain(b.id);
  });

  it('после кулдауна cron выпускает из очереди по одной карточке (старые первыми)', async () => {
    const s = await seller();
    const a = await post(s, 'A');
    const b = await post(s, 'B');
    const c = await post(s, 'C');
    expect(await publishQueuedListings()).toBe(0); // кулдаун ещё идёт
    await prisma.dealerListing.update({ where: { id: a.id }, data: { feed_published_at: ago(4) } });
    expect(await publishQueuedListings()).toBe(1);
    expect((await row(b.id)).feed_published_at).not.toBeNull();
    expect((await row(c.id)).feed_published_at).toBeNull();
  });

  it('кулдаун у групп независимый', async () => {
    const s1 = await seller();
    const s2 = await seller();
    const a = await post(s1);
    const b = await post(s2);
    expect((await row(a.id)).feed_published_at).not.toBeNull();
    expect((await row(b.id)).feed_published_at).not.toBeNull();
  });

  it('Pro выпускает чаще: через 1.5 ч карточка уже проходит, а free ещё ждёт', async () => {
    const free = await seller('free');
    const pro = await seller('pro');
    for (const s of [free, pro]) {
      const first = await post(s, 'A');
      await prisma.dealerListing.update({ where: { id: first.id }, data: { feed_published_at: ago(1.5) } });
    }
    const f = await post(free, 'B');
    const p = await post(pro, 'B');
    expect((await row(f.id)).feed_published_at).toBeNull();
    expect((await row(p.id)).feed_published_at).not.toBeNull();
  });

  it('параллельные публикации одной группы пропускают в ленту ровно одну карточку', async () => {
    const s = await seller();
    const made = await Promise.all(Array.from({ length: 5 }, (_, i) => post(s, `L${i}`)));
    const published = (await Promise.all(made.map((m) => row(m.id)))).filter((r) => r.feed_published_at);
    expect(published).toHaveLength(1);
  });

  it('черновик не занимает кулдаун и попадает в ленту при публикации', async () => {
    const s = await seller();
    const d = await post(s, 'Draft', { status: 'draft' });
    expect((await row(d.id)).feed_published_at).toBeNull();
    const res = await api('PATCH', `/api/dealers-den/${d.id}`, { headers: s.auth, body: { status: 'active' } });
    expect(res.status).toBe(200);
    expect((await row(d.id)).feed_published_at).not.toBeNull();
    expect(await feedIds()).toEqual([d.id]);
  });

  it('общая лента сортируется по feed_at: поднятая карточка выше новой', async () => {
    const s1 = await seller();
    const s2 = await seller();
    const old = await post(s1, 'Old');
    const fresh = await post(s2, 'Fresh');
    expect(await feedIds()).toEqual([fresh.id, old.id]);
    await prisma.dealerListing.update({ where: { id: old.id }, data: { feed_at: new Date(Date.now() + 1000) } });
    expect(await feedIds()).toEqual([old.id, fresh.id]);
  });
});

describe('den feed: поднятия', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  const bump = (s: { auth: Record<string, string> }, id: string) => api('POST', `/api/dealers-den/${id}/bump`, { headers: s.auth });
  const fund = (userId: string, balance: number, promo = 0) =>
    prisma.wallet.create({ data: { user_id: userId, balance, promo_balance: promo } });
  const wallet = async (userId: string) => {
    const w = await prisma.wallet.findUniqueOrThrow({ where: { user_id: userId } });
    return { balance: Number(w.balance), promo: Number(w.promo_balance) };
  };

  it('платное поднятие списывает 0.5 BLM, промо-баланс идёт первым', async () => {
    const s = await seller();
    const l = await post(s);
    await fund(s.user.id, 10, 0.2);
    const res = await bump(s, l.id);
    expect(res.status).toBe(200);
    expect(res.json.data.bump).toMatchObject({ kind: 'paid', costBlm: 0.5 });
    expect(await wallet(s.user.id)).toEqual({ balance: 9.7, promo: 0 });
    const types = (await prisma.walletTransaction.findMany({ where: { user_id: s.user.id, kind: 'den_bump' } })).map((t) => t.balance_type).sort();
    expect(types).toEqual(['main', 'promo']);
    expect((await row(l.id)).last_bumped_at).not.toBeNull();
  });

  it('не хватает средств — 402, карточка и кошелёк не изменились', async () => {
    const s = await seller();
    const l = await post(s);
    await fund(s.user.id, 0.3);
    const before = await row(l.id);
    const res = await bump(s, l.id);
    expect(res.status).toBe(402);
    expect(res.json.code).toBe('INSUFFICIENT_FUNDS');
    expect(await wallet(s.user.id)).toEqual({ balance: 0.3, promo: 0 });
    expect((await row(l.id)).feed_at).toEqual(before.feed_at);
    expect(await prisma.denBump.count()).toBe(0);
  });

  it('повторное поднятие той же карточки раньше интервала — 429', async () => {
    const s = await seller();
    const l = await post(s);
    await fund(s.user.id, 10);
    expect((await bump(s, l.id)).status).toBe(200);
    const again = await bump(s, l.id);
    expect(again.status).toBe(429);
    expect(again.json.code).toBe('BUMP_TOO_SOON');
    expect(await wallet(s.user.id)).toEqual({ balance: 9.5, promo: 0 });
  });

  it('Pro: три бесплатных поднятия в месяц, четвёртое платное', async () => {
    const s = await seller('pro');
    await fund(s.user.id, 10);
    const lots = [];
    for (let i = 0; i < 4; i++) {
      const l = await post(s, `L${i}`);
      await prisma.dealerListing.update({ where: { id: l.id }, data: { feed_published_at: ago(5) } });
      lots.push(l);
    }
    const kinds = [];
    for (const l of lots) kinds.push((await bump(s, l.id)).json.data.bump.kind);
    expect(kinds).toEqual(['free', 'free', 'free', 'paid']);
    expect(await wallet(s.user.id)).toEqual({ balance: 9.5, promo: 0 });
    const info = await api('GET', '/api/dealers-den/bump-info', { headers: s.auth });
    expect(info.json.data).toMatchObject({ freeTotal: 3, freeLeft: 0, priceBlm: 0.5, canAutoBump: false });
  });

  it('бесплатные поднятия прошлого месяца не считаются', async () => {
    const s = await seller('pro');
    const l = await post(s);
    const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) - HOUR);
    await prisma.denBump.createMany({ data: Array.from({ length: 3 }, () => ({ listing_id: l.id, user_id: s.user.id, kind: 'free', created_at: lastMonth })) });
    const info = await api('GET', '/api/dealers-den/bump-info', { headers: s.auth });
    expect(info.json.data.freeLeft).toBe(3);
  });

  it('параллельные клики по разным карточкам не обходят лимит бесплатных и не уходят в минус', async () => {
    const s = await seller('pro');
    await fund(s.user.id, 0.5); // хватит ровно на одно платное
    const lots = [];
    for (let i = 0; i < 6; i++) lots.push(await post(s, `L${i}`));
    const results = await Promise.all(lots.map((l) => bump(s, l.id)));
    const ok = results.filter((r) => r.status === 200);
    expect(ok).toHaveLength(4); // 3 бесплатных + 1 платное
    expect(results.filter((r) => r.status === 402)).toHaveLength(2);
    expect(await wallet(s.user.id)).toEqual({ balance: 0, promo: 0 });
  });

  it('карточку из очереди поднятие выпускает в ленту', async () => {
    const s = await seller();
    await post(s, 'A');
    const queued = await post(s, 'B');
    await fund(s.user.id, 1);
    expect((await bump(s, queued.id)).status).toBe(200);
    expect((await row(queued.id)).feed_published_at).not.toBeNull();
    expect((await feedIds())[0]).toBe(queued.id);
  });

  it('чужую, неактивную и несуществующую карточку поднять нельзя', async () => {
    const s = await seller();
    const other = await seller();
    const l = await post(s);
    const draft = await post(s, 'D', { status: 'draft' });
    await fund(s.user.id, 5);
    await fund(other.user.id, 5);
    expect((await bump(other, l.id)).status).toBe(404);
    expect((await bump(s, draft.id)).status).toBe(409);
    expect((await bump(s, randomUUID())).status).toBe(404);
    expect(await wallet(other.user.id)).toEqual({ balance: 5, promo: 0 });
  });

  it('промо-кошелёк: creditPromo хватает на платное поднятие без основного баланса', async () => {
    const s = await seller();
    const l = await post(s);
    await prisma.$transaction((tx) => creditPromo(tx, s.user.id, 1, { kind: 'promo_grant' }));
    const res = await bump(s, l.id);
    expect(res.status).toBe(200);
    expect(await wallet(s.user.id)).toEqual({ balance: 0, promo: 0.5 });
  });
});

describe('den feed: автоподнятие', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  const toggle = (s: { auth: Record<string, string> }, id: string, enabled: boolean) =>
    api('PUT', `/api/dealers-den/${id}/auto-bump`, { headers: s.auth, body: { enabled } });

  it('включить можно только на Business', async () => {
    const free = await seller('free');
    const biz = await seller('business');
    const a = await post(free);
    const b = await post(biz);
    const denied = await toggle(free, a.id, true);
    expect(denied.status).toBe(403);
    expect(denied.json.code).toBe('PLAN_REQUIRED');
    expect((await toggle(biz, b.id, true)).status).toBe(200);
    expect((await row(b.id)).auto_bump).toBe(true);
  });

  it('cron поднимает карточку, пробывшую в ленте больше суток, бесплатно', async () => {
    const biz = await seller('business');
    const l = await post(biz);
    await prisma.dealerListing.update({ where: { id: l.id }, data: { auto_bump: true, feed_published_at: ago(30), feed_at: ago(30) } });
    expect(await runAutoBumps()).toBe(1);
    const after = await row(l.id);
    expect(after.feed_at!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const log = await prisma.denBump.findMany();
    expect(log).toMatchObject([{ kind: 'auto', listing_id: l.id }]);
    expect(Number(log[0].cost_blm)).toBe(0);
    expect(await prisma.walletTransaction.count()).toBe(0);
    expect(await runAutoBumps()).toBe(0); // свежая карточка пока не нужна
  });

  it('на группу — одно автоподнятие за прогон и не чаще окна', async () => {
    const biz = await seller('business');
    const lots = [];
    for (let i = 0; i < 3; i++) {
      const l = await post(biz, `L${i}`);
      await prisma.dealerListing.update({ where: { id: l.id }, data: { auto_bump: true, feed_published_at: ago(30), feed_at: ago(30 + i) } });
      lots.push(l);
    }
    expect(await runAutoBumps()).toBe(1);
    expect(await runAutoBumps()).toBe(0); // окно 3 ч ещё не прошло
    await prisma.denBump.updateMany({ data: { created_at: ago(4) } });
    expect(await runAutoBumps()).toBe(1);
  });

  it('тариф закончился — автоподнятие снимается и не работает; очередь не обходится', async () => {
    const s = await seller('free');
    const l = await post(s);
    await prisma.dealerListing.update({ where: { id: l.id }, data: { auto_bump: true, feed_at: ago(30) } });
    expect(await runAutoBumps()).toBe(0);
    expect((await row(l.id)).auto_bump).toBe(false);

    const biz = await seller('business');
    await post(biz, 'A');
    const queued = await post(biz, 'B');
    await prisma.dealerListing.update({ where: { id: queued.id }, data: { auto_bump: true } });
    expect(await runAutoBumps()).toBe(0);
    expect((await row(queued.id)).feed_published_at).toBeNull();
  });
});
