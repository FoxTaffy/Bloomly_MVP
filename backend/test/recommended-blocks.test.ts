import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';

async function postBy(authorId: string) {
  return prisma.post.create({ data: { author_id: authorId, content: 'hello', is_nsfw: false, rating: 0 } as any });
}

describe('users/recommended: исключения', () => {
  beforeEach(resetDb);

  it('не рекомендует заблокированных мной, заблокировавших меня, себя и подписки', async () => {
    const me = await createUser();
    const iBlocked = await createUser();
    const blockedMe = await createUser();
    const followed = await createUser();
    const ok = await createUser();
    for (const u of [me, iBlocked, blockedMe, followed, ok]) await postBy(u.user.id);

    await prisma.block.create({ data: { blocker_id: me.user.id, blocked_id: iBlocked.user.id } });
    await prisma.block.create({ data: { blocker_id: blockedMe.user.id, blocked_id: me.user.id } });
    await prisma.follow.create({ data: { follower_id: me.user.id, following_id: followed.user.id } });

    const res = await api('GET', '/api/users/recommended', { headers: me.auth });
    expect(res.status).toBe(200);
    const ids = res.json.data.users.map((u: any) => u.id);
    expect(ids).toContain(ok.user.id);
    for (const bad of [me, iBlocked, blockedMe, followed]) expect(ids).not.toContain(bad.user.id);
  });

  it('пустой результат — пустой список', async () => {
    const me = await createUser();
    const res = await api('GET', '/api/users/recommended', { headers: me.auth });
    expect(res.status).toBe(200);
    expect(res.json.data.users).toEqual([]);
  });
});
