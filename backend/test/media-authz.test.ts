import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api, getApp, PASSWORD } from './helpers.js';
import { mediaUrlForKey } from '../src/modules/media/service.js';
import { clearMediaDecisionCache } from '../src/modules/media/access.js';
import { clearMediaIdentityCache, MEDIA_COOKIE } from '../src/lib/mediaCookie.js';
import { setSetting } from '../src/lib/settings.js';

const key = (folder: string) => `${folder}/${randomUUID()}.webp`;
const path = (k: string) => `/s3/bloomly/${k}`;

/** Подзапрос nginx auth_request: исходный путь файла в X-Original-URI. */
async function authz(k: string, opts: { headers?: Record<string, string>; cookies?: Record<string, string> } = {}) {
  return api('GET', '/api/media/authz', { headers: { 'x-original-uri': k.startsWith('/') ? k : path(k), ...(opts.headers ?? {}) }, cookies: opts.cookies });
}

describe('media: доступ к файлам по прямой ссылке (auth_request)', () => {
  beforeAll(() => getApp());
  beforeEach(async () => {
    await resetDb();
    clearMediaDecisionCache();
    clearMediaIdentityCache();
  });

  it('оформление публично, private/ и неверные пути закрыты для всех', async () => {
    const mod = await createUser({ role: 'moderator' });
    expect((await authz(key('avatars'))).status).toBe(204);
    expect((await authz(key('stickers'))).status).toBe(204);
    expect((await authz(`private/${key('verification')}`, { headers: mod.auth })).status).toBe(403);
    for (const bad of ['/s3/bloomly/posts/../private/x.webp', '/s3/other/posts/a.webp', '/s3/bloomly/posts/a%2F..%2Fb.webp', '/api/x', '']) {
      expect((await authz(bad)).status, bad).toBe(403);
    }
  });

  it('картинка поста следует приватности профиля; оригинал — тоже', async () => {
    const owner = await createUser({ profile_visibility: 'only_me' });
    const outsider = await createUser();
    const display = key('posts');
    const original = `posts/originals/${randomUUID()}.jpg`;
    await prisma.post.create({ data: { author_id: owner.user.id, content: 'x', media_urls: [mediaUrlForKey(display)], media_original_urls: [mediaUrlForKey(original)] } });
    for (const k of [display, original]) {
      expect((await authz(k)).status).toBe(403);
      expect((await authz(k, { headers: outsider.auth })).status).toBe(403);
      expect((await authz(k, { headers: owner.auth })).status).toBe(204);
    }

    const pub = key('posts');
    await prisma.post.create({ data: { author_id: outsider.user.id, content: 'y', media_urls: [mediaUrlForKey(pub)] } });
    expect((await authz(pub)).status).toBe(204);
  });

  it('удалённый пост: файл виден только загрузившему и модераторам', async () => {
    const owner = await createUser();
    const mod = await createUser({ role: 'moderator' });
    const k = key('posts');
    await prisma.mediaObject.create({ data: { object_key: k, owner_id: owner.user.id, folder: 'posts', size_bytes: 10n } });
    await prisma.post.create({ data: { author_id: owner.user.id, content: 'x', media_urls: [mediaUrlForKey(k)], deleted_at: new Date() } });
    expect((await authz(k)).status).toBe(403);
    expect((await authz(k, { headers: owner.auth })).status).toBe(204);
    expect((await authz(k, { headers: mod.auth })).status).toBe(204);
  });

  it('вложение переписки видят только участники', async () => {
    const a = await createUser();
    const b = await createUser();
    const stranger = await createUser();
    const k = key('messages');
    const conv = await prisma.conversation.create({ data: { participants: { create: [{ user_id: a.user.id }, { user_id: b.user.id }] } } });
    await prisma.message.create({ data: { conversation_id: conv.id, sender_id: a.user.id, type: 'image', file_url: mediaUrlForKey(k) } });
    expect((await authz(k, { headers: b.auth })).status).toBe(204);
    expect((await authz(k, { headers: stranger.auth })).status).toBe(403);
    expect((await authz(k)).status).toBe(403);
  });

  it('файл комментария в закрытой группе не виден постороннему', async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const group = await prisma.group.create({ data: {
      name: 'Closed', slug: 'media-' + randomUUID().slice(0, 8), type: 'community', owner_id: owner.user.id, is_public: false, members_count: 1,
      members: { create: { user_id: owner.user.id, role: 'owner' } },
    } });
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: 'x', groupPosts: { create: { group_id: group.id } } } });
    const k = key('comments');
    await prisma.comment.create({ data: { post_id: post.id, author_id: owner.user.id, content: '', file_url: mediaUrlForKey(k) } });
    expect((await authz(k, { headers: outsider.auth })).status).toBe(403);
    expect((await authz(k, { headers: owner.auth })).status).toBe(204);
  });

  it('альбом «только я» и NSFW-референс скрыты, публичные видны', async () => {
    const owner = await createUser();
    const minor = await createUser({ birth_date: new Date(Date.now() - 15 * 365 * 86_400_000) });
    const priv = key('posts');
    await prisma.album.create({ data: { user_id: owner.user.id, title: 'p', privacy: 'private', items: { create: { media_url: mediaUrlForKey(priv), position: 0 } } } });
    expect((await authz(priv)).status).toBe(403);
    expect((await authz(priv, { headers: owner.auth })).status).toBe(204);

    const fursona = await prisma.fursona.create({ data: { user_id: owner.user.id, name: 'F' } as any });
    const nsfw = key('posts');
    const sfw = key('posts');
    await prisma.fursonaReferenceImage.create({ data: { user_id: owner.user.id, fursona_id: fursona.id, image_url: mediaUrlForKey(nsfw), is_nsfw: true } as any });
    await prisma.fursonaReferenceImage.create({ data: { user_id: owner.user.id, fursona_id: fursona.id, image_url: mediaUrlForKey(sfw) } as any });
    expect((await authz(nsfw, { headers: minor.auth })).status).toBe(403);
    expect((await authz(sfw, { headers: minor.auth })).status).toBe(204);
  });

  it('веб: cookie выдаётся при входе, открывает свои файлы и перестаёт действовать после выхода', async () => {
    const u = await createUser({ profile_visibility: 'only_me' });
    const k = key('posts');
    await prisma.post.create({ data: { author_id: u.user.id, content: 'x', media_urls: [mediaUrlForKey(k)] } });

    const login = await api('POST', '/api/auth/login', { body: { email: u.user.email, password: PASSWORD } });
    expect(login.status).toBe(200);
    const media = login.res.cookies.find((c) => c.name === MEDIA_COOKIE)!;
    expect(media).toMatchObject({ httpOnly: true, path: '/s3/', sameSite: 'Lax' });
    const cookies = { [MEDIA_COOKIE]: media.value };
    expect((await authz(k, { cookies })).status).toBe(204);
    // Подделанное значение не принимается
    expect((await authz(k, { cookies: { [MEDIA_COOKIE]: media.value.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')) } })).status).toBe(403);

    const logout = await api('POST', '/api/auth/logout', { cookies: { refresh_token: login.cookie('refresh_token')! } });
    expect(logout.status).toBe(200);
    expect(logout.res.cookies.find((c) => c.name === MEDIA_COOKIE)?.value).toBe('');
    clearMediaDecisionCache();
    clearMediaIdentityCache();
    expect((await authz(k, { cookies })).status).toBe(403);
  });

  it('режим обслуживания не ломает проверку файлов', async () => {
    await setSetting('maintenance_mode', true);
    try {
      expect((await api('GET', '/api/posts')).status).toBe(503);
      expect((await authz(key('avatars'))).status).toBe(204);
    } finally {
      await setSetting('maintenance_mode', false);
    }
  });
});
