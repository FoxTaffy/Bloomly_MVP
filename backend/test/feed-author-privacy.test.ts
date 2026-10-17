import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

const follow = (follower: string, following: string) => prisma.follow.create({ data: { follower_id: follower, following_id: following } });

describe('лента: приватность авторов проверяется пакетно, правила прежние', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('«только друзья» — только при взаимной подписке; заблокировавший автор скрыт', async () => {
    const author = await createUser({ profile_visibility: 'friends' });
    const friend = await createUser();
    const fan = await createUser();
    const blocker = await createUser();
    await prisma.post.create({ data: { author_id: author.user.id, content: 'friends-only-post' } });
    await prisma.post.create({ data: { author_id: blocker.user.id, content: 'blocker-post' } });
    await follow(friend.user.id, author.user.id);
    await follow(author.user.id, friend.user.id);
    await follow(fan.user.id, author.user.id);
    await prisma.block.create({ data: { blocker_id: blocker.user.id, blocked_id: friend.user.id } });

    const forFriend = (await api('GET', '/api/posts?limit=100', { headers: friend.auth })).res.body;
    expect(forFriend).toContain('friends-only-post');
    expect(forFriend).not.toContain('blocker-post');

    const forFan = (await api('GET', '/api/posts?limit=100', { headers: fan.auth })).res.body;
    expect(forFan).not.toContain('friends-only-post');
    expect(forFan).toContain('blocker-post');

    const forAuthor = (await api('GET', '/api/posts?limit=100', { headers: author.auth })).res.body;
    expect(forAuthor).toContain('friends-only-post');
  });
});

describe('filterByProfilePrivacy (второй слой после SQL-политики)', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('пакетная проверка совпадает с прежними правилами', async () => {
    const { filterByProfilePrivacy } = await import('../src/modules/posts/service.js');
    const viewer = await createUser();
    const friendOnly = await createUser({ profile_visibility: 'friends' });
    const oneWay = await createUser({ profile_visibility: 'friends' });
    const hidden = await createUser({ profile_visibility: 'only_me' });
    const open = await createUser();
    const blocker = await createUser();
    await follow(viewer.user.id, friendOnly.user.id);
    await follow(friendOnly.user.id, viewer.user.id);
    await follow(viewer.user.id, oneWay.user.id);
    await prisma.block.create({ data: { blocker_id: blocker.user.id, blocked_id: viewer.user.id } });
    const rows = [friendOnly, oneWay, hidden, open, blocker, viewer].map((u) => ({ author_id: u.user.id }));

    const seen = (await filterByProfilePrivacy(rows, viewer.user.id)).map((r) => r.author_id);
    expect(seen.sort()).toEqual([friendOnly.user.id, open.user.id, viewer.user.id].sort());
    const guest = (await filterByProfilePrivacy(rows, undefined)).map((r) => r.author_id);
    expect(guest.sort()).toEqual([open.user.id, blocker.user.id, viewer.user.id].sort());
  });
});
