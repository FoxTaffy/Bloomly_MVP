import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, resetDb, api, prisma } from './helpers.js';

describe('подписки: скрытый профиль и чёрный список', () => {
  beforeEach(resetDb);

  it('на скрытый профиль нельзя подписаться мини-кнопкой (прямой вызов toggle)', async () => {
    const me = await createUser();
    const hidden = await createUser({ profile_visibility: 'only_me' });
    const friendsOnly = await createUser({ profile_visibility: 'friends' });

    for (const target of [hidden, friendsOnly]) {
      const res = await api('POST', `/api/follows/${target.user.id}/toggle`, { headers: me.auth });
      expect(res.status).toBe(403);
      expect(res.json.error.code).toBe('PROFILE_PRIVATE');
    }
    expect(await prisma.follow.count()).toBe(0);
  });

  it('ответная подписка на скрытый профиль разрешена, отписка — всегда', async () => {
    const me = await createUser();
    const hidden = await createUser({ profile_visibility: 'friends' });
    await prisma.follow.create({ data: { follower_id: hidden.user.id, following_id: me.user.id } });

    const follow = await api('POST', `/api/follows/${hidden.user.id}/toggle`, { headers: me.auth });
    expect(follow.status).toBe(200);
    expect(follow.json.data.following).toBe(true);

    await prisma.user.update({ where: { id: hidden.user.id }, data: { profile_visibility: 'only_me' } });
    const unfollow = await api('POST', `/api/follows/${hidden.user.id}/toggle`, { headers: me.auth });
    expect(unfollow.json.data.following).toBe(false);
  });

  it('поиск отдаёт can_follow=false для скрытых профилей', async () => {
    const me = await createUser();
    const open = await createUser({ username: 'zz_open_one' });
    const hidden = await createUser({ username: 'zz_hidden_one', profile_visibility: 'only_me' });
    const res = await api('GET', '/api/users/search?q=zz_&limit=10', { headers: me.auth });
    const byId = Object.fromEntries(res.json.data.users.map((u: any) => [u.id, u.can_follow]));
    expect(byId[open.user.id]).toBe(true);
    expect(byId[hidden.user.id]).toBe(false);
  });

  it('люди из ЧС (в обе стороны) не попадают в «возможные друзья»', async () => {
    const me = await createUser();
    const friend = await createUser();
    const blockedByMe = await createUser();
    const blockedMe = await createUser();
    const ok = await createUser();
    // friend — взаимный; остальные — его друзья, т.е. кандидаты «друзья друзей»
    for (const [a, b] of [[me, friend], [friend, me], [friend, blockedByMe], [friend, blockedMe], [friend, ok]] as const) {
      await prisma.follow.create({ data: { follower_id: a.user.id, following_id: b.user.id } });
    }
    await prisma.block.create({ data: { blocker_id: me.user.id, blocked_id: blockedByMe.user.id } });
    await prisma.block.create({ data: { blocker_id: blockedMe.user.id, blocked_id: me.user.id } });

    const res = await api('GET', '/api/friends/suggestions', { headers: me.auth });
    const ids = res.json.data.map((u: any) => u.id);
    expect(ids).toContain(ok.user.id);
    expect(ids).not.toContain(blockedByMe.user.id);
    expect(ids).not.toContain(blockedMe.user.id);
  });
});
