import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';

async function postBy(authorId: string) {
  return prisma.post.create({
    data: { author_id: authorId, content: `private-${randomUUID().slice(0, 6)}`, is_nsfw: false, rating: 0 } as any,
  });
}

describe('posts: закрытый профиль не виден посторонним', () => {
  beforeEach(resetDb);

  it('пост закрытого профиля не открывается по прямой ссылке', async () => {
    const owner = await createUser({ profile_visibility: 'nobody' });
    const stranger = await createUser();
    const post = await postBy(owner.user.id);

    const res = await api('GET', `/api/posts/${post.id}`, { headers: stranger.auth });
    expect(res.status).toBe(403);
  });

  it('владелец видит свой пост закрытого профиля', async () => {
    const owner = await createUser({ profile_visibility: 'nobody' });
    const post = await postBy(owner.user.id);
    const res = await api('GET', `/api/posts/${post.id}`, { headers: owner.auth });
    expect(res.status).toBe(200);
  });

  it('пост закрытого профиля не попадает в общую ленту', async () => {
    const owner = await createUser({ profile_visibility: 'nobody' });
    const stranger = await createUser();
    const post = await postBy(owner.user.id);

    const res = await api('GET', '/api/posts?limit=100', { headers: stranger.auth });
    expect(res.status).toBe(200);
    const ids = (res.json.data.posts ?? res.json.data ?? []).map((p: any) => p.id);
    expect(ids).not.toContain(post.id);
  });
});
