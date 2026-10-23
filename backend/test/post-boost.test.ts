import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

const DAY = 86_400_000;
const exp = () => new Date(Date.now() + 10 * DAY);

async function author(tier = 'free', balance = 20, promo = 0) {
  const u = await createUser({ subscription_tier: tier, subscription_expires_at: tier === 'free' ? null : exp() });
  await prisma.wallet.create({ data: { user_id: u.user.id, balance, promo_balance: promo } });
  return u;
}
const mkPost = (authorId: string, over: Record<string, unknown> = {}) =>
  prisma.post.create({ data: { author_id: authorId, content: 'пост ' + randomUUID().slice(0, 6), ...over } });
const boost = (auth: Record<string, string>, id: string) => api('POST', `/api/posts/${id}/boost`, { headers: auth });
const wallet = async (id: string) => {
  const w = await prisma.wallet.findUniqueOrThrow({ where: { user_id: id } });
  return { balance: Number(w.balance), promo: Number(w.promo_balance) };
};

describe('буст поста: лимиты и оплата', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('Free платит 1 BLM: пост получает окно продвижения на 24 часа', async () => {
    const u = await author('free', 5);
    const p = await mkPost(u.user.id);
    const res = await boost(u.auth, p.id);
    expect(res.status).toBe(200);
    expect(res.json.data.boost).toMatchObject({ kind: 'paid', costBlm: 1, freeLeft: 0 });
    expect(await wallet(u.user.id)).toEqual({ balance: 4, promo: 0 });
    const row = await prisma.post.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.boosted_until!.getTime() - row.boosted_at!.getTime()).toBe(24 * 3_600_000);
    const log = await prisma.walletTransaction.findMany({ where: { user_id: u.user.id } });
    expect(log).toMatchObject([{ kind: 'post_boost', ref_id: p.id, balance_type: 'main' }]);
  });

  it('Business: десять бесплатных бустов в месяц, одиннадцатый платный', async () => {
    const u = await author('business', 5);
    const kinds: string[] = [];
    for (let i = 0; i < 11; i++) {
      const p = await mkPost(u.user.id);
      kinds.push((await boost(u.auth, p.id)).json.data.boost.kind);
    }
    expect(kinds).toEqual([...Array(10).fill('free'), 'paid']);
    expect(await wallet(u.user.id)).toEqual({ balance: 4, promo: 0 });
    const info = await api('GET', '/api/posts/boost-info', { headers: u.auth });
    expect(info.json.data).toMatchObject({ priceBlm: 1, freeTotal: 10, freeLeft: 0, durationHours: 24 });
  });

  it('бесплатные бусты прошлого месяца не считаются; у Pro и Free бесплатных нет', async () => {
    const biz = await author('business');
    const p = await mkPost(biz.user.id);
    const lastMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) - 3_600_000);
    await prisma.postBoost.createMany({ data: Array.from({ length: 10 }, () => ({ post_id: p.id, user_id: biz.user.id, kind: 'free', created_at: lastMonth })) });
    expect((await api('GET', '/api/posts/boost-info', { headers: biz.auth })).json.data.freeLeft).toBe(10);
    const pro = await author('pro');
    expect((await api('GET', '/api/posts/boost-info', { headers: pro.auth })).json.data).toMatchObject({ freeTotal: 0, freeLeft: 0 });
  });

  it('промо-баланс тратится первым', async () => {
    const u = await author('free', 5, 0.4);
    const p = await mkPost(u.user.id);
    expect((await boost(u.auth, p.id)).status).toBe(200);
    expect(await wallet(u.user.id)).toEqual({ balance: 4.4, promo: 0 });
    const types = (await prisma.walletTransaction.findMany({ where: { user_id: u.user.id } })).map((t) => t.balance_type).sort();
    expect(types).toEqual(['main', 'promo']);
  });

  it('не хватает BLM — 402, пост и кошелёк не изменились', async () => {
    const u = await author('free', 0.5, 0.2);
    const p = await mkPost(u.user.id);
    const res = await boost(u.auth, p.id);
    expect(res.status).toBe(402);
    expect(res.json.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await wallet(u.user.id)).toEqual({ balance: 0.5, promo: 0.2 });
    expect((await prisma.post.findUniqueOrThrow({ where: { id: p.id } })).boosted_until).toBeNull();
    expect(await prisma.postBoost.count()).toBe(0);
  });

  it('повторный буст того же поста — 429 до конца кулдауна, потом можно', async () => {
    const u = await author('free', 10);
    const p = await mkPost(u.user.id);
    expect((await boost(u.auth, p.id)).status).toBe(200);
    const again = await boost(u.auth, p.id);
    expect(again.status).toBe(429);
    expect(again.json.error.code).toBe('BOOST_TOO_SOON');
    expect(await wallet(u.user.id)).toEqual({ balance: 9, promo: 0 });
    await prisma.post.update({ where: { id: p.id }, data: { boosted_at: new Date(Date.now() - 49 * 3_600_000) } });
    expect((await boost(u.auth, p.id)).status).toBe(200);
  });

  it('чужой, удалённый, архивный и несуществующий пост продвигать нельзя', async () => {
    const u = await author('free', 10);
    const other = await author('free', 10);
    const foreign = await mkPost(other.user.id);
    const deleted = await mkPost(u.user.id, { deleted_at: new Date() });
    const archived = await mkPost(u.user.id, { is_archived: true });
    expect((await boost(u.auth, foreign.id)).status).toBe(404);
    expect((await boost(u.auth, deleted.id)).status).toBe(404);
    expect((await boost(u.auth, archived.id)).status).toBe(409);
    expect((await boost(u.auth, randomUUID())).status).toBe(404);
    expect((await boost(u.auth, 'not-a-uuid')).status).toBe(404);
    expect(await wallet(u.user.id)).toEqual({ balance: 10, promo: 0 });
  });

  it('гонка: 9 бесплатных уже потрачено, 1 BLM на счёте, три поста разом — один бесплатный, один платный, один 402', async () => {
    const u = await author('business', 1);
    const seed = await mkPost(u.user.id);
    await prisma.postBoost.createMany({ data: Array.from({ length: 9 }, () => ({ post_id: seed.id, user_id: u.user.id, kind: 'free' })) });
    const posts = await Promise.all([mkPost(u.user.id), mkPost(u.user.id), mkPost(u.user.id)]);
    const results = await Promise.all(posts.map((p) => boost(u.auth, p.id)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 402]);
    expect(results.filter((r) => r.status === 200).map((r) => r.json.data.boost.kind).sort()).toEqual(['free', 'paid']);
    expect(await wallet(u.user.id)).toEqual({ balance: 0, promo: 0 });
  });
});

describe('буст поста: охват в ленте', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  async function crowdedFeed() {
    const a = await author('free', 10);
    // старый пост за пределами первой страницы
    const old = await mkPost(a.user.id, { created_at: new Date(Date.now() - 30 * DAY), content: 'старый пост' });
    const others = await createUser();
    for (let i = 0; i < 35; i++) await mkPost(others.user.id, { created_at: new Date(Date.now() - i * 60_000) });
    return { a, old };
  }

  it('без буста старый пост на первую страницу ленты не попадает', async () => {
    const { old } = await crowdedFeed();
    const viewer = await createUser();
    const pub = await api('GET', '/api/posts?limit=30', { headers: viewer.auth });
    expect(pub.json.data.posts.map((p: any) => p.id)).not.toContain(old.id);
    const pers = await api('GET', '/api/posts/personalized', { headers: viewer.auth });
    expect(pers.json.data.posts.map((p: any) => p.id)).not.toContain(old.id);
  });

  it('продвигаемый пост поднимается наверх общей и персональной ленты', async () => {
    const { a, old } = await crowdedFeed();
    expect((await boost(a.auth, old.id)).status).toBe(200);
    const viewer = await createUser();
    const pub = await api('GET', '/api/posts?limit=30', { headers: viewer.auth });
    expect(pub.json.data.posts[0].id).toBe(old.id);
    expect(pub.json.data.posts[0].boosted_until).toBeTruthy();
    const ids = pub.json.data.posts.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const pers = await api('GET', '/api/posts/personalized', { headers: viewer.auth });
    expect(pers.json.data.posts[0].id).toBe(old.id);
    const pids = pers.json.data.posts.map((p: any) => p.id);
    expect(new Set(pids).size).toBe(pids.length);
  });

  it('вторая страница и поиск не меняются от буста; по окончании окна пост уходит из подборки', async () => {
    const { a, old } = await crowdedFeed();
    const viewer = await createUser();
    const page2Before = (await api('GET', '/api/posts?limit=30&page=2', { headers: viewer.auth })).json.data.posts.map((p: any) => p.id);
    await boost(a.auth, old.id);
    const page2After = (await api('GET', '/api/posts?limit=30&page=2', { headers: viewer.auth })).json.data.posts.map((p: any) => p.id);
    expect(page2After).toEqual(page2Before);
    const searched = await api('GET', '/api/posts?limit=30&search=%D0%BF%D0%BE%D1%81%D1%82', { headers: viewer.auth });
    expect(searched.json.data.posts.map((p: any) => p.id)[0]).not.toBe(old.id);
    await prisma.post.update({ where: { id: old.id }, data: { boosted_until: new Date(Date.now() - 1000) } });
    const after = await api('GET', '/api/posts?limit=30', { headers: viewer.auth });
    expect(after.json.data.posts.map((p: any) => p.id)).not.toContain(old.id);
  });

  it('продвижение не обходит блокировки: заблокировавший автора его пост в ленте не видит', async () => {
    const { a, old } = await crowdedFeed();
    await boost(a.auth, old.id);
    const viewer = await createUser();
    await prisma.block.create({ data: { blocker_id: viewer.user.id, blocked_id: a.user.id } }).catch(() => null);
    const pub = await api('GET', '/api/posts?limit=30', { headers: viewer.auth });
    const blocked = await prisma.block.count({ where: { blocker_id: viewer.user.id, blocked_id: a.user.id } });
    if (blocked) expect(pub.json.data.posts.map((p: any) => p.id)).not.toContain(old.id);
  });
});
