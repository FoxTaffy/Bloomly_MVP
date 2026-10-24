import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

const checkNew = async (who: { auth: Record<string, string> }, query: string) => {
  const { res } = await api('GET', `/api/posts/check-new?${query}`, { headers: who.auth });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};
const post = (authorId: string, data: Record<string, unknown> = {}) =>
  prisma.post.create({ data: { author_id: authorId, content: 'text', ...data } });
const iso = (d: Date) => encodeURIComponent(d.toISOString());

describe('GET /posts/check-new: счётчик для плашки «Новые посты»', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('общая лента: считает только посты новее since', async () => {
    const viewer = await createUser();
    const author = await createUser();
    const old = await post(author.user.id, { created_at: new Date('2026-01-01T00:00:00Z') });
    await post(author.user.id, { created_at: new Date('2026-01-02T00:00:00Z') });
    await post(author.user.id, { created_at: new Date('2026-01-03T00:00:00Z') });

    const r = await checkNew(viewer, `mode=news&since=${iso(old.created_at)}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ count: 2 });
  });

  it('«Фото» считает только посты с медиа; NSFW-посты в режиме hide не считаются', async () => {
    const viewer = await createUser();
    const author = await createUser();
    const since = new Date('2026-01-01T00:00:00Z');
    await post(author.user.id, { created_at: new Date('2026-01-02T00:00:00Z') });
    await post(author.user.id, { created_at: new Date('2026-01-02T00:00:00Z'), media_urls: ['https://s3/x.webp'] });
    await post(author.user.id, { created_at: new Date('2026-01-02T00:00:00Z'), is_nsfw: true });

    expect((await checkNew(viewer, `mode=news&since=${iso(since)}`)).body.data.count).toBe(2);
    expect((await checkNew(viewer, `mode=photos&since=${iso(since)}`)).body.data.count).toBe(1);
  });

  it('подписки: только авторы, на которых подписан, заблокированные не считаются', async () => {
    const viewer = await createUser();
    const followed = await createUser();
    const stranger = await createUser();
    const blocked = await createUser();
    await prisma.follow.create({ data: { follower_id: viewer.user.id, following_id: followed.user.id } });
    await prisma.follow.create({ data: { follower_id: viewer.user.id, following_id: blocked.user.id } });
    await prisma.block.create({ data: { blocker_id: blocked.user.id, blocked_id: viewer.user.id } });
    const at = new Date('2026-01-02T00:00:00Z');
    await post(followed.user.id, { created_at: at });
    await post(stranger.user.id, { created_at: at });
    await post(blocked.user.id, { created_at: at });

    const r = await checkNew(viewer, `mode=subscriptions&since=${iso(new Date('2026-01-01T00:00:00Z'))}`);
    expect(r.body.data.count).toBe(1);
  });

  it('«Для вас»: скрытые «Не интересно» и посты заблокировавших не считаются', async () => {
    const viewer = await createUser();
    const author = await createUser();
    const blocker = await createUser();
    await prisma.block.create({ data: { blocker_id: blocker.user.id, blocked_id: viewer.user.id } });
    const at = new Date('2026-01-02T00:00:00Z');
    await post(author.user.id, { created_at: at });
    const hidden = await post(author.user.id, { created_at: at });
    await post(blocker.user.id, { created_at: at });
    await prisma.postNotInterested.create({ data: { user_id: viewer.user.id, post_id: hidden.id } });

    const r = await checkNew(viewer, `mode=for-you&since=${iso(new Date('2026-01-01T00:00:00Z'))}`);
    expect(r.body.data.count).toBe(1);
  });

  it('самый свежий из уже показанных постов не считается новым (микросекунды в БД, миллисекунды в JS)', async () => {
    const viewer = await createUser();
    const author = await createUser();
    const shown = await post(author.user.id);
    await prisma.$executeRaw`UPDATE "Post" SET created_at = '2026-01-02 00:00:00.123456' WHERE id = ${shown.id}::uuid`;
    const r = await checkNew(viewer, `mode=news&since=${iso(new Date('2026-01-02T00:00:00.123Z'))}`);
    expect(r.body.data.count).toBe(0);
  });

  it('число ограничено сверху, а мусорные параметры дают 400', async () => {
    const viewer = await createUser();
    const author = await createUser();
    await prisma.post.createMany({
      data: Array.from({ length: 120 }, () => ({ author_id: author.user.id, content: 'bulk', created_at: new Date('2026-01-02T00:00:00Z') })),
    });
    const since = iso(new Date('2026-01-01T00:00:00Z'));
    expect((await checkNew(viewer, `mode=news&since=${since}`)).body.data.count).toBe(100);
    expect((await checkNew(viewer, `mode=bogus&since=${since}`)).status).toBe(400);
    expect((await checkNew(viewer, 'mode=news&since=вчера')).status).toBe(400);
    expect((await checkNew(viewer, 'mode=news')).status).toBe(400);
  });

  it('без входа — 401', async () => {
    await getApp();
    const { res } = await api('GET', `/api/posts/check-new?mode=news&since=${iso(new Date())}`);
    expect(res.statusCode).toBe(401);
  });
});
