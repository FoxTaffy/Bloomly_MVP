import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';

describe('sitemap, OG-превью и /auth/me', () => {
  beforeEach(resetDb);

  it('sitemap и OG-страницы строятся из данных', async () => {
    const { user } = await createUser({ display_name: 'Lisa', bio: 'Hello bio' });
    const post = await prisma.post.create({ data: { content: 'Post body', author_id: user.id } as any });
    const group = await prisma.group.create({ data: { slug: 'g-seo', name: 'Seo Group', type: 'static', owner_id: user.id } });

    // /sitemap.xml — индекс; сами адреса лежат в файлах sitemap-{profiles|posts|groups}-N.xml
    const index = await api('GET', '/sitemap.xml');
    expect(index.status).toBe(200);
    const files = [...index.res.body.matchAll(/<loc>[^<]*\/(sitemap-[a-z]+(?:-\d+)?\.xml)<\/loc>/g)].map((m) => m[1]);
    expect(files).toContain('sitemap-static.xml');
    let all = '';
    for (const f of files) {
      const page = await api('GET', `/${f}`);
      expect(page.status, f).toBe(200);
      all += page.res.body;
    }
    for (const part of [`/profile/${user.username}`, `/post/${post.id}`, '/groups/g-seo']) expect(all).toContain(part);

    expect((await api('GET', `/og/post/${post.id}`)).res.body).toContain('Post body');
    expect((await api('GET', `/og/profile/${user.username}`)).res.body).toContain('Hello bio');
    expect((await api('GET', `/og/group/${group.id}`)).res.body).toContain('Seo Group');
    expect((await api('GET', '/og/profile/nobody-here')).status).toBe(404);
  });

  it('OG-превью лота: название, цена и текст в описании, картинка лота, og:url на страницу лота', async () => {
    const { user } = await createUser({ display_name: 'Fox Taffy' });
    const lot = await prisma.dealerListing.create({
      data: {
        seller_id: user.id,
        title: 'BoyKisser YCH',
        description: 'Рисую фурри, всех типов',
        price: 5,
        currency: 'USD',
        images: ['https://cdn.example.com/ych.png'],
        listing_kind: 'ych',
        status: 'active',
      },
    });
    const html = (await api('GET', `/og/listing/${lot.id}`)).res.body;
    expect(html).toContain('<meta property="og:title" content="BoyKisser YCH"/>');
    expect(html).toContain('5 USD — Рисую фурри, всех типов');
    expect(html).toContain('<meta property="og:image" content="https://cdn.example.com/ych.png"/>');
    expect(html).toContain(`<meta property="og:url" content="https://bloomly.fun/dealers-den/${lot.id}"/>`);

    await prisma.dealerListing.update({ where: { id: lot.id }, data: { is_nsfw: true } });
    expect((await api('GET', `/og/listing/${lot.id}`)).status).toBe(404);
    expect((await api('GET', `/og/listing/${randomUUID()}`)).status).toBe(404);
  });

  it('OG-превью главной Dealers\' Den отдаётся без данных из базы', async () => {
    const html = (await api('GET', '/og/dealers-den')).res.body;
    expect(html).toContain('<meta property="og:title" content="Dealers\' Den"/>');
    expect(html).toContain('<meta property="og:url" content="https://bloomly.fun/dealers-den"/>');
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
