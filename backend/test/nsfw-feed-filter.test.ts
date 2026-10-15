import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { resolveNsfwMode, nsfwWhere } from '../src/lib/contentFilters.js';

const ADULT = new Date('1990-01-01T00:00:00.000Z');
const MINOR = new Date(Date.now() - 15 * 365 * 24 * 3600 * 1000);

describe('resolveNsfwMode / nsfwWhere', () => {
  it('несовершеннолетний и гость всегда получают hide', () => {
    for (const nsfw of ['hide', 'blur', 'show']) {
      expect(resolveNsfwMode({ nsfw, safeMode: 'false', isAdult: false })).toBe('hide');
    }
  });

  it('взрослый: nsfw главнее safeMode, safeMode работает как legacy, по умолчанию hide', () => {
    expect(resolveNsfwMode({ nsfw: 'blur', safeMode: 'true', isAdult: true })).toBe('blur');
    expect(resolveNsfwMode({ nsfw: 'show', isAdult: true })).toBe('show');
    expect(resolveNsfwMode({ safeMode: 'true', isAdult: true })).toBe('hide');
    expect(resolveNsfwMode({ safeMode: 'false', isAdult: true })).toBe('show');
    expect(resolveNsfwMode({ isAdult: true })).toBe('hide');
    expect(resolveNsfwMode({ nsfw: 'garbage', isAdult: true })).toBe('hide');
  });

  it('фильтр попадает в where только для hide', () => {
    expect(nsfwWhere('hide')).toEqual({ is_nsfw: false });
    expect(nsfwWhere('blur')).toEqual({});
    expect(nsfwWhere('show')).toEqual({});
  });
});

describe('NSFW во всех лентах главной', () => {
  beforeEach(resetDb);

  /** 5 обычных + 5 NSFW постов, все с медиа, чередуются по времени. Возвращает id'ы. */
  async function seed(authorId: string) {
    const safe: string[] = [];
    const nsfw: string[] = [];
    for (let i = 0; i < 10; i++) {
      const isNsfw = i % 2 === 1;
      const p = await prisma.post.create({
        data: {
          author_id: authorId,
          content: `post-${i}`,
          is_nsfw: isNsfw,
          media_urls: [`https://cdn.test/${i}.jpg`],
          rating: 10 - i,
          created_at: new Date(Date.now() - i * 60_000),
        } as any,
      });
      (isNsfw ? nsfw : safe).push(p.id);
    }
    return { safe, nsfw };
  }

  const ids = (res: any) => (res.json.data.posts as any[]).map((p) => p.id);

  /** Все четыре вкладки главной: Для вас / Подписки / Общие новости / Фото. */
  function tabs(mode: string, headers: Record<string, string>, limit = 100) {
    return {
      'for-you': () => api('GET', `/api/posts/personalized?nsfw=${mode}&limit=${limit}`, { headers }),
      subscriptions: () => api('GET', `/api/follows/feed?nsfw=${mode}`, { headers }),
      news: () => api('GET', `/api/posts?sort=new&nsfw=${mode}&limit=${limit}`, { headers }),
      photos: () => api('GET', `/api/posts?hasMedia=true&nsfw=${mode}&limit=${limit}`, { headers }),
    };
  }

  async function setup(viewerOver: Record<string, unknown>) {
    const author = await createUser({ birth_date: ADULT });
    const viewer = await createUser(viewerOver);
    await prisma.follow.create({ data: { follower_id: viewer.user.id, following_id: author.user.id } } as any);
    return { posts: await seed(author.user.id), viewer };
  }

  it('взрослый: hide скрывает NSFW, blur и show отдают всё — одинаково на всех вкладках', async () => {
    const { posts, viewer } = await setup({ birth_date: ADULT });
    const all = [...posts.safe, ...posts.nsfw].sort();

    for (const [name, call] of Object.entries(tabs('hide', viewer.auth))) {
      const res = await call();
      expect(res.status, name).toBe(200);
      expect(ids(res).sort(), `${name}/hide`).toEqual([...posts.safe].sort());
    }
    for (const mode of ['blur', 'show']) {
      for (const [name, call] of Object.entries(tabs(mode, viewer.auth))) {
        const res = await call();
        expect(ids(res).sort(), `${name}/${mode}`).toEqual(all);
      }
    }
  });

  it('несовершеннолетний получает hide даже при nsfw=show', async () => {
    const { posts, viewer } = await setup({ birth_date: MINOR });
    for (const [name, call] of Object.entries(tabs('show', viewer.auth))) {
      const res = await call();
      expect(ids(res).sort(), name).toEqual([...posts.safe].sort());
    }
  });

  it('пользователь без даты рождения считается несовершеннолетним', async () => {
    const { posts, viewer } = await setup({});
    const res = await tabs('show', viewer.auth).news();
    expect(ids(res).sort()).toEqual([...posts.safe].sort());
  });

  it('гость: публичные вкладки отдают только обычные посты, личные требуют входа', async () => {
    const { posts } = await setup({ birth_date: ADULT });
    for (const name of ['news', 'photos'] as const) {
      const res = await tabs('show', {})[name]();
      expect(res.status, name).toBe(200);
      expect(ids(res).sort(), name).toEqual([...posts.safe].sort());
    }
    expect((await tabs('show', {})['for-you']()).status).toBe(401);
    expect((await tabs('show', {}).subscriptions()).status).toBe(401);
  });

  it('legacy safeMode=true и параметр по умолчанию дают hide', async () => {
    const { posts, viewer } = await setup({ birth_date: ADULT });
    for (const qs of ['safeMode=true', '']) {
      const res = await api('GET', `/api/posts?${qs}&limit=100`, { headers: viewer.auth });
      expect(ids(res).sort(), qs).toEqual([...posts.safe].sort());
    }
  });

  it('фильтр в запросе: страница 2 заполнена, без дублей и пропусков', async () => {
    const { posts, viewer } = await setup({ birth_date: ADULT });
    // 5 обычных постов, limit=3 → страница 1: 3, страница 2: 2 (а не «3 минус NSFW»).
    const p1 = await api('GET', '/api/posts?sort=new&nsfw=hide&limit=3&page=1', { headers: viewer.auth });
    const p2 = await api('GET', '/api/posts?sort=new&nsfw=hide&limit=3&page=2', { headers: viewer.auth });
    expect(ids(p1)).toHaveLength(3);
    expect(ids(p2)).toHaveLength(2);
    expect([...ids(p1), ...ids(p2)].sort()).toEqual([...posts.safe].sort());

    const f1 = await api('GET', '/api/posts/personalized?nsfw=hide&limit=3&page=1', { headers: viewer.auth });
    const f2 = await api('GET', '/api/posts/personalized?nsfw=hide&limit=3&page=2', { headers: viewer.auth });
    expect(ids(f2).length).toBeGreaterThan(0);
    expect(ids(f1).concat(ids(f2)).every((id) => posts.safe.includes(id))).toBe(true);
  });
});
