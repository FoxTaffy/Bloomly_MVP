import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { interleave } from '../src/modules/posts/service.js';

const mkPost = (authorId: string, content: string, extra: Record<string, unknown> = {}) =>
  prisma.post.create({ data: { content, author_id: authorId, ...extra } as never });

describe('персональная лента', () => {
  beforeEach(resetDb);

  it('колокольчик первым, без «не интересно», без заблокировавших, без недавно просмотренных', async () => {
    const me = await createUser();
    const fav = await createUser();
    const other = await createUser();
    const blocker = await createUser();

    const old = new Date(Date.now() - 3 * 86_400_000);
    const favPost = await mkPost(fav.user.id, 'bell post', { created_at: old, rating: 0 });
    const popular = await mkPost(other.user.id, 'popular', { rating: 50 });
    const hidden = await mkPost(other.user.id, 'hidden', { rating: 40 });
    const viewed = await mkPost(other.user.id, 'viewed', { rating: 30 });
    await mkPost(blocker.user.id, 'from blocker', { rating: 60 });

    await prisma.follow.create({ data: { follower_id: me.user.id, following_id: fav.user.id, notify_posts: true } });
    await prisma.postNotInterested.create({ data: { user_id: me.user.id, post_id: hidden.id } });
    await prisma.userActivity.create({ data: { user_id: me.user.id, post_id: viewed.id, type: 'VIEW' } as never });
    await prisma.block.create({ data: { blocker_id: blocker.user.id, blocked_id: me.user.id } });

    const res = await api('GET', '/api/posts/personalized', { headers: me.auth });
    expect(res.status).toBe(200);
    const ids = res.json.data.posts.map((p: { id: string }) => p.id);
    expect(ids[0]).toBe(favPost.id);
    expect(ids).toContain(popular.id);
    expect(ids).toHaveLength(2);
  });

  it('interleave берёт 3 из первого списка, затем 2 из второго', () => {
    expect(interleave([1, 2, 3, 4, 5, 6, 7], 3, ['a', 'b', 'c'], 2)).toEqual([1, 2, 3, 'a', 'b', 4, 5, 6, 'c', 7]);
    expect(interleave([], 3, ['a'], 2)).toEqual(['a']);
  });
});
