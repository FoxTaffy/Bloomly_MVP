import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

const DAY = 86_400_000;
const order = (r: Awaited<ReturnType<typeof api>>) => r.json.data.posts.map((p: any) => p.content);

describe('GET /posts: сортировка общей ленты (тикет f32bd1af)', () => {
  let viewer: Awaited<ReturnType<typeof createUser>>;
  beforeAll(() => getApp());
  beforeEach(async () => {
    await resetDb();
    viewer = await createUser();
    const author = await createUser();
    const mk = (content: string, rating: number, ageDays: number) => prisma.post.create({
      data: { author_id: author.user.id, content, rating, created_at: new Date(Date.now() - ageDays * DAY) } as any,
    });
    await mk('old-top', 50, 40);
    await mk('month-good', 20, 10);
    await mk('week-mid', 10, 3);
    await mk('today-low', 1, 0.1);
  });

  it('по умолчанию и sort=new — новые сверху', async () => {
    for (const q of ['', '&sort=new']) {
      const r = await api('GET', `/api/posts?nsfw=hide${q}`, { headers: viewer.auth });
      expect(order(r)).toEqual(['today-low', 'week-mid', 'month-good', 'old-top']);
    }
  });

  it('sort=old — старые сверху', async () => {
    const r = await api('GET', '/api/posts?sort=old', { headers: viewer.auth });
    expect(order(r)).toEqual(['old-top', 'month-good', 'week-mid', 'today-low']);
  });

  it('sort=hot — по рейтингу за всё время и за период', async () => {
    expect(order(await api('GET', '/api/posts?sort=hot', { headers: viewer.auth }))).toEqual(['old-top', 'month-good', 'week-mid', 'today-low']);
    expect(order(await api('GET', '/api/posts?sort=hot&period=month', { headers: viewer.auth }))).toEqual(['month-good', 'week-mid', 'today-low']);
    expect(order(await api('GET', '/api/posts?sort=hot&period=week', { headers: viewer.auth }))).toEqual(['week-mid', 'today-low']);
    expect(order(await api('GET', '/api/posts?sort=hot&period=day', { headers: viewer.auth }))).toEqual(['today-low']);
  });

  it('неизвестные значения не ломают выдачу; period без sort=hot игнорируется', async () => {
    const r = await api('GET', '/api/posts?sort=bogus&period=forever', { headers: viewer.auth });
    expect(r.status).toBe(200);
    expect(order(r)).toEqual(['today-low', 'week-mid', 'month-good', 'old-top']);
    expect(order(await api('GET', '/api/posts?period=day', { headers: viewer.auth }))).toHaveLength(4);
  });

  it('равный рейтинг: страницы не дублируют и не теряют посты', async () => {
    await resetDb();
    const author = await createUser();
    for (let i = 0; i < 25; i++) await prisma.post.create({ data: { author_id: author.user.id, content: `same-${i}`, rating: 5 } as any });
    const seen: string[] = [];
    for (const page of [1, 2, 3]) seen.push(...order(await api('GET', `/api/posts?sort=hot&page=${page}&limit=10`)));
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
  });
});
