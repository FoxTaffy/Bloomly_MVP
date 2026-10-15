import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, resetDb, api, prisma } from './helpers.js';

describe('friends: notify_posts приходит прямо в списках', () => {
  beforeEach(resetDb);

  it('/friends и /friends/following отдают колокольчик без отдельных запросов', async () => {
    const me = await createUser();
    const bell = await createUser();
    const quiet = await createUser();
    const onlyFollowed = await createUser();

    // bell и quiet — взаимные (друзья), onlyFollowed — просто подписка
    for (const o of [bell, quiet]) {
      await prisma.follow.create({ data: { follower_id: me.user.id, following_id: o.user.id, notify_posts: o === bell } });
      await prisma.follow.create({ data: { follower_id: o.user.id, following_id: me.user.id } });
    }
    await prisma.follow.create({ data: { follower_id: me.user.id, following_id: onlyFollowed.user.id, notify_posts: true } });

    const friends = await api('GET', '/api/friends', { headers: me.auth });
    expect(friends.status).toBe(200);
    const byId = Object.fromEntries(friends.json.data.map((f: any) => [f.id, f.notify_posts]));
    expect(byId[bell.user.id]).toBe(true);
    expect(byId[quiet.user.id]).toBe(false);

    const following = await api('GET', '/api/friends/following', { headers: me.auth });
    expect(following.json.data).toHaveLength(1);
    expect(following.json.data[0]).toMatchObject({ id: onlyFollowed.user.id, notify_posts: true });
  });

  it('чужой колокольчик не утекает: followers всегда notify_posts=false', async () => {
    const me = await createUser();
    const fan = await createUser();
    await prisma.follow.create({ data: { follower_id: fan.user.id, following_id: me.user.id, notify_posts: true } });
    const res = await api('GET', '/api/friends/followers', { headers: me.auth });
    expect(res.json.data[0]).toMatchObject({ id: fan.user.id, notify_posts: false });
  });
});
