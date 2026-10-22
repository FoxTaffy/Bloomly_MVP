import { beforeEach, describe, expect, it } from 'vitest';
import { api, createUser, prisma, resetDb } from './helpers.js';

describe('restored comment ratings', () => {
  beforeEach(resetDb);

  async function setup() {
    const owner = await createUser();
    const reader = await createUser();
    const post = await prisma.post.create({ data: { author_id: owner.user.id, content: 'Обсуждение рисунка' } });
    const comment = await prisma.comment.create({ data: { author_id: owner.user.id, post_id: post.id, content: 'Первый комментарий' } });
    return { owner, reader, post, comment };
  }

  it('returns the viewer vote for comments and replies without exposing somebody else’s vote', async () => {
    const { reader, owner, post, comment } = await setup();
    const reply = await prisma.comment.create({ data: { author_id: owner.user.id, post_id: post.id, parent_id: comment.id, content: 'Вложенный ответ' } });
    await api('POST', `/api/posts/comments/${comment.id}/vote`, { headers: reader.auth, body: { value: 1 } });
    await api('POST', `/api/posts/comments/${reply.id}/vote`, { headers: reader.auth, body: { value: -1 } });
    const mine = await api('GET', `/api/posts/${post.id}/comments`, { headers: reader.auth });
    expect(mine.json.data.comments[0].user_vote).toBe(1);
    expect(mine.json.data.comments[0].rating).toBe(1);
    expect(mine.json.data.comments[0].replies[0].user_vote).toBe(-1);
    expect(mine.json.data.comments[0].replies[0].rating).toBe(-1);
    const guest = await api('GET', `/api/posts/${post.id}/comments`);
    expect(guest.json.data.comments[0].user_vote).toBe(0);
    expect(guest.json.data.comments[0].replies[0].user_vote).toBe(0);
  });

  it('keeps the existing positive/negative/clear toggle contract', async () => {
    const { reader, post, comment } = await setup();
    for (const [value, rating, mine] of [[1, 1, 1], [-1, -1, -1], [-1, 0, 0], [1, 1, 1], [1, 0, 0]]) {
      const vote = await api('POST', `/api/posts/comments/${comment.id}/vote`, { headers: reader.auth, body: { value } });
      expect(vote.status).toBe(200);
      expect(vote.json.data.rating).toBe(rating);
      const loaded = await api('GET', `/api/posts/${post.id}/comments`, { headers: reader.auth });
      expect(loaded.json.data.comments[0].user_vote).toBe(mine);
    }
  });

  it('rejects invalid vote values instead of changing the stored rating', async () => {
    const { reader, comment } = await setup();
    for (const value of [0, 2, -2, '1', null]) {
      expect((await api('POST', `/api/posts/comments/${comment.id}/vote`, { headers: reader.auth, body: { value } })).status).toBe(400);
    }
    expect(await prisma.commentVote.count()).toBe(0);
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })).rating).toBe(0);
  });

  it('concurrent votes from different readers keep the aggregate equal to actual active votes', async () => {
    const { comment } = await setup();
    const readers = await Promise.all(Array.from({ length: 6 }, () => createUser()));
    const results = await Promise.all(readers.map((reader, index) => api('POST', `/api/posts/comments/${comment.id}/vote`, {
      headers: reader.auth, body: { value: index < 4 ? 1 : -1 },
    })));
    expect(results.map(result => result.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const active = await prisma.commentVote.findMany({ where: { comment_id: comment.id, deleted_at: null } });
    const stored = await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } });
    expect(stored.rating).toBe(active.reduce((sum, vote) => sum + vote.value, 0));
    expect(stored.rating).toBe(2);
  });

  it('two simultaneous identical clicks by the same reader toggle back without a duplicate row', async () => {
    const { reader, comment } = await setup();
    const results = await Promise.all([1, 1].map(value => api('POST', `/api/posts/comments/${comment.id}/vote`, { headers: reader.auth, body: { value } })));
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(await prisma.commentVote.count({ where: { comment_id: comment.id, user_id: reader.user.id } })).toBe(1);
    expect((await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } })).rating).toBe(0);
  });
});
