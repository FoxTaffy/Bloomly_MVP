import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

const adultBirth = new Date('1990-01-01');
const minorBirth = new Date(Date.now() - 15 * 365 * 24 * 3_600_000);

async function mkPost(authorId: string, content: string, isNsfw: boolean) {
  return prisma.post.create({ data: { author_id: authorId, content, is_nsfw: isNsfw } as any });
}
const ids = (r: Awaited<ReturnType<typeof api>>) => r.json.data.posts.map((p: any) => p.content).sort();

describe('GET /posts: nsfwOnly (вкладка NSFW)', () => {
  let adult: Awaited<ReturnType<typeof createUser>>;
  beforeAll(() => getApp());
  beforeEach(async () => {
    await resetDb();
    adult = await createUser({ birth_date: adultBirth });
    await mkPost(adult.user.id, 'safe', false);
    await mkPost(adult.user.id, 'spicy', true);
  });

  it('взрослый с nsfw=show&nsfwOnly=true получает только NSFW', async () => {
    const r = await api('GET', '/api/posts?nsfw=show&nsfwOnly=true', { headers: adult.auth });
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual(['spicy']);
  });

  it('nsfw=blur тоже даёт только NSFW', async () => {
    const r = await api('GET', '/api/posts?nsfw=blur&nsfwOnly=true', { headers: adult.auth });
    expect(ids(r)).toEqual(['spicy']);
  });

  it('без nsfwOnly nsfw=show возвращает всё (регрессия: старое поведение не сломано)', async () => {
    const r = await api('GET', '/api/posts?nsfw=show', { headers: adult.auth });
    expect(ids(r)).toEqual(['safe', 'spicy']);
  });

  it('nsfwOnly=false не фильтрует', async () => {
    const r = await api('GET', '/api/posts?nsfw=show&nsfwOnly=false', { headers: adult.auth });
    expect(ids(r)).toEqual(['safe', 'spicy']);
  });

  it('взрослый с nsfw=hide и nsfwOnly=true получает пустой список', async () => {
    const r = await api('GET', '/api/posts?nsfw=hide&nsfwOnly=true', { headers: adult.auth });
    expect(r.json.data.posts).toEqual([]);
  });

  it('гость: nsfw=show&nsfwOnly=true — пусто, обычные посты не просачиваются', async () => {
    const r = await api('GET', '/api/posts?nsfw=show&nsfwOnly=true');
    expect(r.status).toBe(200);
    expect(r.json.data.posts).toEqual([]);
  });

  it('несовершеннолетний: принудительный hide → пусто', async () => {
    const minor = await createUser({ birth_date: minorBirth });
    const r = await api('GET', '/api/posts?nsfw=show&nsfwOnly=true', { headers: minor.auth });
    expect(r.json.data.posts).toEqual([]);
  });

  it('пользователь без даты рождения считается несовершеннолетним → пусто', async () => {
    const nobody = await createUser({ birth_date: null });
    const r = await api('GET', '/api/posts?nsfw=show&nsfwOnly=true', { headers: nobody.auth });
    expect(r.json.data.posts).toEqual([]);
  });

  it('пагинация считается внутри NSFW-выборки', async () => {
    for (let i = 0; i < 3; i++) await mkPost(adult.user.id, `n${i}`, true);
    const p1 = await api('GET', '/api/posts?nsfw=show&nsfwOnly=true&limit=2&page=1', { headers: adult.auth });
    const p2 = await api('GET', '/api/posts?nsfw=show&nsfwOnly=true&limit=2&page=2', { headers: adult.auth });
    expect(p1.json.data.posts).toHaveLength(2);
    expect(p2.json.data.posts).toHaveLength(2);
    expect([...p1.json.data.posts, ...p2.json.data.posts].every((p: any) => p.is_nsfw === true)).toBe(true);
  });
});
