import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, resetDb, api, prisma } from './helpers.js';
import { invalidateTagSynonyms } from '../src/lib/tagSynonyms.js';
import { swapLayout, parseSearchQuery } from '../src/lib/searchQuery.js';

async function post(authorId: string, content: string, tags: string[] = [], over: Record<string, unknown> = {}) {
  return prisma.post.create({
    data: {
      author_id: authorId,
      content,
      media_urls: ['https://example.com/a.webp'],
      tags: { create: tags.map((name) => ({ tag: { connectOrCreate: { where: { name }, create: { name } } } })) },
      ...over,
    } as any,
  });
}
const ids = (res: any) => res.json.data.posts.map((p: any) => p.id);

describe('разбор запроса', () => {
  it('исправляет раскладку в обе стороны и не трогает смешанные слова', () => {
    expect(swapLayout('ghbdtn')).toBe('привет');
    expect(swapLayout('руддщ')).toBe('hello');
    expect(swapLayout('fox1')).toBeNull();
    expect(swapLayout('привет')).not.toBeNull();
  });
  it('режет на слова, убирает «#», ограничивает число слов', () => {
    const p = parseSearchQuery('#Fox  furry_art #wip a b c d e');
    expect(p.terms.map((t) => t.text)).toEqual(['fox', 'furry_art', 'wip', 'a', 'b', 'c']);
  });
});

describe('поиск постов: релевантность', () => {
  beforeEach(async () => { await resetDb(); invalidateTagSynonyms(); });

  it('пост с точным тегом выше поста, где слово лишь в тексте, хотя он старше', async () => {
    const u = await createUser();
    const tagged = await post(u.user.id, 'просто картинка', ['fox'], { created_at: new Date(Date.now() - 20 * 86400_000) });
    const mention = await post(u.user.id, 'сегодня видел fox в парке');
    const res = await api('GET', '/api/posts/search?q=fox', { headers: u.auth });
    expect(ids(res)).toEqual([tagged.id, mention.id]);
  });

  it('sort=new отдаёт по дате', async () => {
    const u = await createUser();
    const tagged = await post(u.user.id, 'x', ['fox'], { created_at: new Date(Date.now() - 20 * 86400_000) });
    const mention = await post(u.user.id, 'сегодня видел fox в парке');
    const res = await api('GET', '/api/posts/search?q=fox&sort=new', { headers: u.auth });
    expect(ids(res)).toEqual([mention.id, tagged.id]);
  });

  it('все слова запроса обязательны', async () => {
    const u = await createUser();
    const both = await post(u.user.id, 'рыжая лиса на снегу', ['art']);
    await post(u.user.id, 'рыжая собака');
    await post(u.user.id, 'снег идёт');
    const res = await api('GET', '/api/posts/search?q=лиса снегу', { headers: u.auth });
    expect(ids(res)).toEqual([both.id]);
  });

  it('находит по запросу в неверной раскладке', async () => {
    const u = await createUser();
    const p = await post(u.user.id, 'x', ['привет']);
    const res = await api('GET', `/api/posts/search?q=${encodeURIComponent('ghbdtn')}`, { headers: u.auth });
    expect(ids(res)).toEqual([p.id]);
  });

  it('прощает опечатку в теге', async () => {
    const u = await createUser();
    const p = await post(u.user.id, 'x', ['furry']);
    const res = await api('GET', '/api/posts/search?q=furri', { headers: u.auth });
    expect(ids(res)).toEqual([p.id]);
  });

  it('синонимы включены по умолчанию и отключаются synonyms=false', async () => {
    const mod = await createUser({ role: 'moderator' });
    await api('POST', '/api/tags/synonyms', { headers: mod.auth, body: { alias: 'лис', canonical: 'fox' } });
    const p = await post(mod.user.id, 'x', ['лис']);
    const on = await api('GET', '/api/posts/search?q=fox', { headers: mod.auth });
    expect(ids(on)).toEqual([p.id]);
    const off = await api('GET', '/api/posts/search?q=fox&synonyms=false', { headers: mod.auth });
    expect(ids(off)).toEqual([]);
  });

  it('пагинация не повторяет посты', async () => {
    const u = await createUser();
    for (let i = 0; i < 5; i++) await post(u.user.id, `fox ${i}`);
    const p1 = ids(await api('GET', '/api/posts/search?q=fox&limit=3&page=1', { headers: u.auth }));
    const p2 = ids(await api('GET', '/api/posts/search?q=fox&limit=3&page=2', { headers: u.auth }));
    expect(p1).toHaveLength(3);
    expect(p2).toHaveLength(2);
    expect(new Set([...p1, ...p2]).size).toBe(5);
  });
});

describe('подсказки тегов', () => {
  beforeEach(async () => { await resetDb(); invalidateTagSynonyms(); });

  it('по началу слова, с числом постов; синонимы склеены в основной тег', async () => {
    const mod = await createUser({ role: 'moderator' });
    await api('POST', '/api/tags/synonyms', { headers: mod.auth, body: { alias: 'лис', canonical: 'fox' } });
    await post(mod.user.id, 'a', ['fox']);
    await post(mod.user.id, 'b', ['лис']);
    await post(mod.user.id, 'c', ['fox', 'лис']);
    await post(mod.user.id, 'd', ['foxes_art']);
    const res = await api('GET', '/api/posts/search/tags?q=fo&nsfw=true');
    const tags = res.json.data.tags;
    expect(tags[0]).toEqual({ name: 'fox', count: 3 });
    expect(tags.map((t: any) => t.name)).not.toContain('лис');
  });
});

describe('поиск людей и групп', () => {
  beforeEach(async () => { await resetDb(); });

  it('точный ник выше вхождения; опечатка в нике находится', async () => {
    const me = await createUser();
    const partial = await createUser({ username: 'big_foxy_guy' });
    const exact = await createUser({ username: 'foxy' });
    const res = await api('GET', '/api/users/search?q=foxy', { headers: me.auth });
    const names = res.json.data.users.map((u: any) => u.username);
    expect(names.slice(0, 2)).toEqual(['foxy', 'big_foxy_guy']);

    const typo = await api('GET', '/api/users/search?q=foxxy', { headers: me.auth });
    expect(typo.json.data.users.map((u: any) => u.id)).toContain(exact.user.id);
    void partial;
  });

  it('группы: найденное по началу названия выше, подтверждённые и крупные выше при равенстве', async () => {
    const owner = await createUser();
    const mk = (name: string, slug: string, members: number) =>
      prisma.group.create({ data: { name, slug, type: 'creative', owner_id: owner.user.id, members_count: members } as any });
    await mk('Любители лис', 'lis-lovers', 500);
    await mk('Лис', 'lis', 5);
    const res = await api('GET', '/api/groups/search?q=лис');
    expect(res.json.data.groups.map((g: any) => g.slug)).toEqual(['lis', 'lis-lovers']);
  });
});
