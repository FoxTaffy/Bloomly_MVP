import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb } from './helpers.js';
import { friendsService } from '../src/modules/friends/service.js';

async function befriend(a: string, b: string) {
  await prisma.follow.createMany({ data: [{ follower_id: a, following_id: b }, { follower_id: b, following_id: a }] });
}

describe('друзья: «в сети» уважает настройку «Кто видит, что я в сети»', () => {
  beforeEach(resetDb);

  it('online скрыт для nobody/only_me, виден для everyone/friends; устройство — только когда онлайн показан', async () => {
    const me = await createUser();
    const levels = ['everyone', 'friends', 'nobody', 'only_me'] as const;
    const friends: Record<string, string> = {};
    for (const level of levels) {
      const f = await createUser({ online_status_visibility: level } as any);
      await befriend(me.user.id, f.user.id);
      friends[level] = f.user.id;
    }
    const online = new Set(Object.values(friends));
    const devices = new Map(Object.values(friends).map((id) => [id, 'mobile']));
    const list = await friendsService.getFriends(me.user.id, online, devices);
    const byId = new Map(list.map((u: any) => [u.id, u]));
    expect(byId.get(friends.everyone)).toMatchObject({ online: true, device: 'mobile' });
    expect(byId.get(friends.friends)).toMatchObject({ online: true, device: 'mobile' });
    expect(byId.get(friends.nobody)).toMatchObject({ online: false, device: null });
    expect(byId.get(friends.only_me)).toMatchObject({ online: false, device: null });
    for (const u of list) expect(u).not.toHaveProperty('online_status_visibility');
  });

  it('полоска статусов друзей тоже не раскрывает скрытый онлайн', async () => {
    const me = await createUser();
    const hidden = await createUser({ online_status_visibility: 'nobody', profile_status: { text: 'тут' } } as any);
    await befriend(me.user.id, hidden.user.id);
    const list = await friendsService.getStatuses(me.user.id, new Set([hidden.user.id]));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: hidden.user.id, online: false });
    expect(list[0]).not.toHaveProperty('online_status_visibility');
  });
});
