import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api, getApp } from './helpers.js';

async function group(ownerId: string, over: Record<string, unknown> = {}) {
  return prisma.group.create({ data: {
    name: 'Hidden staff', slug: 'hid-' + randomUUID().slice(0, 8), type: 'community', owner_id: ownerId,
    is_public: true, members_count: 1, members: { create: { user_id: ownerId, role: 'owner' } }, ...over,
  } as any });
}

describe('группы: скрытая администрация на сервере', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('посторонний и участник не получают владельца и списка скрытых; владелец и админ получают', async () => {
    const owner = await createUser();
    const admin = await createUser();
    const member = await createUser();
    const guestish = await createUser();
    const g = await group(owner.user.id, { hide_admins: true, hidden_member_ids: JSON.stringify([member.user.id]) });
    await prisma.groupMember.createMany({ data: [
      { group_id: g.id, user_id: admin.user.id, role: 'admin' },
      { group_id: g.id, user_id: member.user.id, role: 'member' },
    ] });

    for (const viewer of [undefined, guestish.auth, member.auth]) {
      const res = await api('GET', `/api/groups/${g.slug}`, { headers: viewer });
      expect(res.status).toBe(200);
      const body = res.res.body;
      expect(body).not.toContain(owner.user.id);
      expect(body).not.toContain(owner.user.username);
      expect(body).not.toContain(member.user.id);
      expect(res.json.data.group?.owner ?? res.json.data.owner ?? null).toBeNull();
    }
    const list = await api('GET', '/api/groups?search=' + g.slug, { headers: guestish.auth });
    expect(list.res.body).toContain(g.id);
    expect(list.res.body).not.toContain(owner.user.id);

    for (const viewer of [owner.auth, admin.auth]) {
      const res = await api('GET', `/api/groups/${g.slug}`, { headers: viewer });
      expect(res.res.body).toContain(owner.user.id);
    }
  });

  it('без скрытия владелец виден как раньше, список скрытых — только админам', async () => {
    const owner = await createUser();
    const hidden = await createUser();
    const g = await group(owner.user.id, { hidden_member_ids: JSON.stringify([hidden.user.id]) });
    const res = await api('GET', `/api/groups/${g.slug}`);
    expect(res.res.body).toContain(owner.user.username);
    expect(res.res.body).not.toContain(hidden.user.id);
  });

  it('группа со скрытой ролью не раскрывается в списке групп профиля', async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const hiddenGroup = await group(owner.user.id, { hide_admins: true });
    const openGroup = await group(owner.user.id);
    const res = await api('GET', `/api/groups/user/${owner.user.id}`, { headers: viewer.auth });
    expect(res.status).toBe(200);
    expect(res.res.body).toContain(openGroup.id);
    expect(res.res.body).not.toContain(hiddenGroup.id);
    const own = await api('GET', `/api/groups/user/${owner.user.id}`, { headers: owner.auth });
    expect(own.res.body).toContain(hiddenGroup.id);
  });
});
