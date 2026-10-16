import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';

describe('sitemap, OG-превью и /auth/me', () => {
  beforeEach(resetDb);

  it('sitemap и OG-страницы строятся из данных', async () => {
    const { user } = await createUser({ display_name: 'Lisa', bio: 'Hello bio' });
    const post = await prisma.post.create({ data: { content: 'Post body', author_id: user.id } as any });
    const group = await prisma.group.create({ data: { slug: 'g-seo', name: 'Seo Group', type: 'static', owner_id: user.id } });

    const sm = await api('GET', '/sitemap.xml');
    expect(sm.status).toBe(200);
    for (const part of [`/profile/${user.username}`, `/post/${post.id}`, '/groups/g-seo']) expect(sm.res.body).toContain(part);

    expect((await api('GET', `/og/post/${post.id}`)).res.body).toContain('Post body');
    expect((await api('GET', `/og/profile/${user.username}`)).res.body).toContain('Hello bio');
    expect((await api('GET', `/og/group/${group.id}`)).res.body).toContain('Seo Group');
    expect((await api('GET', '/og/profile/nobody-here')).status).toBe(404);
  });

  it('/auth/me отдаёт профиль с is_adult и без birth_date', async () => {
    const u = await createUser({ birth_date: new Date('1990-01-01') });
    const me = await api('GET', '/api/auth/me', { headers: u.auth });
    expect(me.status).toBe(200);
    expect(me.json.data.user.id).toBe(u.user.id);
    expect(me.json.data.user.is_adult).toBe(true);
    expect(me.json.data.user.birth_date).toBeUndefined();
    expect(me.json.data.user.password).toBeUndefined();
  });
});
