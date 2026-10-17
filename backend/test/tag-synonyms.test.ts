import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, resetDb, api, prisma } from './helpers.js';
import { invalidateTagSynonyms } from '../src/lib/tagSynonyms.js';

async function postWithTags(authorId: string, tags: string[]) {
  return prisma.post.create({
    data: {
      author_id: authorId,
      content: 'post',
      media_urls: ['https://example.com/a.webp'],
      tags: { create: tags.map((name) => ({ tag: { connectOrCreate: { where: { name }, create: { name } } } })) },
    },
  });
}

describe('синонимы хештегов', () => {
  beforeEach(async () => { await resetDb(); invalidateTagSynonyms(); });

  it('только модераторы управляют синонимами', async () => {
    const user = await createUser();
    const res = await api('POST', '/api/tags/synonyms', { headers: user.auth, body: { alias: 'лиса', canonical: 'fox' } });
    expect(res.status).toBe(403);
  });

  it('популярные теги склеивают синонимы и варианты с «_»/«-», пост с двумя синонимами считается один раз', async () => {
    const mod = await createUser({ role: 'moderator' });
    const add = await api('POST', '/api/tags/synonyms', { headers: mod.auth, body: { alias: '#Лиса', canonical: 'fox' } });
    expect(add.status).toBe(201);

    await postWithTags(mod.user.id, ['fox']);
    await postWithTags(mod.user.id, ['лиса']);
    await postWithTags(mod.user.id, ['fox', 'лиса']);
    await postWithTags(mod.user.id, ['furry_art']);
    await postWithTags(mod.user.id, ['furry-art']);

    const res = await api('GET', '/api/posts/trending-tags?includeNsfw=true');
    const byName = Object.fromEntries(res.json.data.tags.map((t: any) => [t.name, t.totalCount]));
    expect(byName.fox).toBe(3);
    expect(byName['лиса']).toBeUndefined();
    expect(Object.entries(byName).filter(([n]) => n.startsWith('furry'))).toEqual([[expect.any(String), 2]]);
  });

  it('фильтр по тегу находит синонимы только с synonyms=true', async () => {
    const mod = await createUser({ role: 'moderator' });
    await api('POST', '/api/tags/synonyms', { headers: mod.auth, body: { alias: 'лиса', canonical: 'fox' } });
    const a = await postWithTags(mod.user.id, ['fox']);
    const b = await postWithTags(mod.user.id, ['лиса']);
    const c = await postWithTags(mod.user.id, ['fo-x']);

    const plain = await api('GET', '/api/posts?tag=fox');
    expect(plain.json.data.posts.map((p: any) => p.id)).toEqual([a.id]);

    const withSyn = await api('GET', '/api/posts?tag=лиса&synonyms=true');
    expect(withSyn.json.data.posts.map((p: any) => p.id).sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it('без цепочек: синоним основного тега перенаправляется на его основной', async () => {
    const mod = await createUser({ role: 'moderator' });
    await api('POST', '/api/tags/synonyms', { headers: mod.auth, body: { alias: 'лиса', canonical: 'fox' } });
    await api('POST', '/api/tags/synonyms', { headers: mod.auth, body: { alias: 'лисица', canonical: 'лиса' } });
    const self = await api('POST', '/api/tags/synonyms', { headers: mod.auth, body: { alias: 'fur_ry', canonical: 'furry' } });
    expect(self.status).toBe(400);

    const list = await api('GET', '/api/tags/synonyms', { headers: mod.auth });
    expect(list.json.data.synonyms.map((s: any) => [s.alias, s.canonical]).sort()).toEqual([['лиса', 'fox'], ['лисица', 'fox']]);
  });
});
