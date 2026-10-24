import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

type Who = { user: { id: string }; auth: Record<string, string> };

const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));
const makePost = (authorId: string, minute: number, data: Record<string, unknown> = {}) =>
  prisma.post.create({ data: { author_id: authorId, content: `post-${minute}`, created_at: at(minute), ...data } });

/** Идёт по страницам, пока сервер не вернёт nextCursor = null. between() вызывается между запросами — там «жизнь» ленты. */
async function readAll(who: Who, path: string, between?: (page: number, ids: string[]) => Promise<void>) {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let page = 1; page <= 20; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const { json }: { json: any } = await api('GET', `${path}${cursor ? `${sep}cursor=${cursor}` : ''}`, { headers: who.auth });
    expect(json.success).toBe(true);
    const pageIds = (json.data.posts as { id: string }[]).map((p) => p.id);
    ids.push(...pageIds);
    cursor = json.data.nextCursor;
    if (between) await between(page, pageIds);
    if (!cursor) return { ids, pages: page };
  }
  throw new Error('cursor never ended');
}

const unique = (ids: string[]) => new Set(ids).size === ids.length;

describe('курсорная пагинация: общая лента', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('новые сверху: все посты по одному разу, даже если между страницами появился новый пост', async () => {
    const viewer = await createUser();
    const author = await createUser();
    const originals = [];
    for (let m = 1; m <= 9; m++) originals.push((await makePost(author.user.id, m)).id);

    const { ids } = await readAll(viewer, '/api/posts?limit=4', async (page) => {
      if (page === 1) await makePost(author.user.id, 100); // смещение сдвинуло бы все страницы и дало дубль
    });
    expect(unique(ids)).toBe(true);
    for (const id of originals) expect(ids).toContain(id);
    // порядок: от новых к старым
    const times = (await prisma.post.findMany({ where: { id: { in: ids } }, select: { id: true, created_at: true } }))
      .reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.id]: p.created_at.getTime() }), {});
    const seq = ids.map((id) => times[id]);
    expect(seq).toEqual([...seq].sort((a, b) => b - a));
  });

  it('старые сверху и «лучшие» (с одинаковым рейтингом) тоже не теряют посты', async () => {
    const viewer = await createUser();
    const author = await createUser();
    const all: string[] = [];
    for (let m = 1; m <= 10; m++) all.push((await makePost(author.user.id, m, { rating: m % 3 })).id);

    const old = await readAll(viewer, '/api/posts?limit=3&sort=old');
    expect(unique(old.ids)).toBe(true);
    expect([...old.ids].sort()).toEqual([...all].sort());
    expect(old.ids[0]).toBe(all[0]);

    const hot = await readAll(viewer, '/api/posts?limit=3&sort=hot&period=all');
    expect(unique(hot.ids)).toBe(true);
    expect([...hot.ids].sort()).toEqual([...all].sort());
  });

  it('полная последняя страница даёт ещё один запрос, неполная — nextCursor = null', async () => {
    const viewer = await createUser();
    const author = await createUser();
    for (let m = 1; m <= 4; m++) await makePost(author.user.id, m);
    const { json } = await api('GET', '/api/posts?limit=10', { headers: viewer.auth });
    expect(json.data.posts).toHaveLength(4);
    expect(json.data.nextCursor).toBeNull();
  });

  it('page по-прежнему работает (мобильное приложение), а мусорный курсор — 400', async () => {
    const viewer = await createUser();
    const author = await createUser();
    for (let m = 1; m <= 5; m++) await makePost(author.user.id, m);
    const second = await api('GET', '/api/posts?limit=2&page=2', { headers: viewer.auth });
    expect(second.json.data.posts).toHaveLength(2);
    for (const bad of ['not-a-cursor', Buffer.from('{"t":"x","id":"1"}').toString('base64url'), 'A'.repeat(500)]) {
      expect((await api('GET', `/api/posts?cursor=${bad}`, { headers: viewer.auth })).res.statusCode).toBe(400);
    }
  });
});

describe('курсорная пагинация: подписки', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('лента подписок не дублирует и не теряет посты при новых публикациях', async () => {
    const viewer = await createUser();
    const author = await createUser();
    await prisma.follow.create({ data: { follower_id: viewer.user.id, following_id: author.user.id } });
    const all: string[] = [];
    for (let m = 1; m <= 70; m++) all.push((await makePost(author.user.id, m)).id); // страница подписок — 30 постов

    const { ids, pages } = await readAll(viewer, '/api/follows/feed', async (page) => {
      if (page === 1) await makePost(author.user.id, 200);
    });
    expect(pages).toBeGreaterThanOrEqual(3);
    expect(unique(ids)).toBe(true);
    for (const id of all) expect(ids).toContain(id);
  });
});

describe('курсорная пагинация: «Для вас»', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('просмотренные между страницами посты не сдвигают выдачу и ничего не пропускают', async () => {
    const viewer = await createUser();
    const author = await createUser();
    const all: string[] = [];
    for (let m = 1; m <= 12; m++) all.push((await makePost(author.user.id, m)).id);

    const { ids } = await readAll(viewer, '/api/posts/personalized?limit=4', async (_page, pageIds) => {
      // пользователь прочитал страницу: просмотры исключаются из следующих запросов (30 последних действий)
      await prisma.userActivity.createMany({ data: pageIds.map((post_id) => ({ user_id: viewer.user.id, post_id, type: 'VIEW', duration: 5000 })) });
    });
    expect(unique(ids)).toBe(true);
    expect([...ids].sort()).toEqual([...all].sort());
  });

  it('два потока (любимые категории и «открытия») читаются до конца без потерь и дублей', async () => {
    const viewer = await createUser();
    const author = await createUser();
    const liked = await makePost(author.user.id, 50, { category: 'photography' });
    await prisma.userActivity.create({ data: { user_id: viewer.user.id, post_id: liked.id, type: 'LIKE' } });
    const all: string[] = [liked.id];
    // lastActivity выше исключает только VIEW, так что liked остаётся в выдаче
    for (let m = 1; m <= 8; m++) all.push((await makePost(author.user.id, m, { category: 'photography' })).id);
    for (let m = 11; m <= 20; m++) all.push((await makePost(author.user.id, m, { category: m % 2 ? 'writing' : null })).id);

    const { ids, pages } = await readAll(viewer, '/api/posts/personalized?limit=5');
    expect(pages).toBeGreaterThan(2);
    expect(unique(ids)).toBe(true);
    expect([...ids].sort()).toEqual([...all].sort());
  });

  it('категории зафиксированы в курсоре: лайк между страницами не перекидывает посты из потока в поток', async () => {
    const viewer = await createUser();
    const author = await createUser();
    const seed = await makePost(author.user.id, 90, { category: 'photography' });
    await prisma.userActivity.create({ data: { user_id: viewer.user.id, post_id: seed.id, type: 'LIKE' } });
    const all: string[] = [seed.id];
    for (let m = 1; m <= 6; m++) all.push((await makePost(author.user.id, m, { category: 'photography' })).id);
    for (let m = 11; m <= 16; m++) all.push((await makePost(author.user.id, m, { category: 'writing' })).id);

    const { ids } = await readAll(viewer, '/api/posts/personalized?limit=5', async (page) => {
      if (page === 1) {
        // вкусы сместились: теперь «любимая» категория — writing
        const w = await makePost(author.user.id, 200, { category: 'writing' });
        await prisma.userActivity.createMany({ data: Array.from({ length: 6 }, () => ({ user_id: viewer.user.id, post_id: w.id, type: 'LIKE' })) });
      }
    });
    expect(unique(ids)).toBe(true);
    for (const id of all) expect(ids).toContain(id);
  });

  it('курсор чужой ленты и мусор — 400, page по-прежнему принимается', async () => {
    const viewer = await createUser();
    const author = await createUser();
    for (let m = 1; m <= 5; m++) await makePost(author.user.id, m);
    const postsCursor = (await api('GET', '/api/posts?limit=2', { headers: viewer.auth })).json.data.nextCursor;
    expect(postsCursor).toBeTruthy();
    expect((await api('GET', `/api/posts/personalized?cursor=${postsCursor}`, { headers: viewer.auth })).res.statusCode).toBe(400);
    expect((await api('GET', '/api/posts/personalized?cursor=%%%', { headers: viewer.auth })).res.statusCode).toBe(400);
    expect((await api('GET', `/api/follows/feed?cursor=nope`, { headers: viewer.auth })).res.statusCode).toBe(400);
    expect((await api('GET', '/api/posts/personalized?limit=2&page=2', { headers: viewer.auth })).res.statusCode).toBe(200);
  });
});
