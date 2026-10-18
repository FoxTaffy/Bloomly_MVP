import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';

async function makeGroup(isPublic = true) {
  const owner = await createUser();
  const tag = randomUUID().slice(0, 8);
  const group = await prisma.group.create({
    data: { slug: `g-${tag}`, name: `Group ${tag}`, type: 'static', owner_id: owner.user.id, is_public: isPublic, members_count: 1 },
  });
  await prisma.groupMember.create({ data: { group_id: group.id, user_id: owner.user.id, role: 'owner' } });
  return { owner, group };
}

async function addMember(groupId: string, role = 'member') {
  const u = await createUser();
  await prisma.groupMember.create({ data: { group_id: groupId, user_id: u.user.id, role } });
  await prisma.group.update({ where: { id: groupId }, data: { members_count: { increment: 1 } } });
  return u;
}

describe('группа: кастомные роли', () => {
  beforeEach(resetDb);

  it('кастомная роль с can_post даёт участнику право публиковать', async () => {
    const { owner, group } = await makeGroup();
    const member = await addMember(group.id);
    const denied = await api('POST', `/api/groups/${group.id}/posts`, { headers: member.auth, body: { content: 'hi' } });
    expect(denied.status).toBe(403);

    const role = await api('POST', `/api/groups/${group.id}/roles`, { headers: owner.auth, body: { name: 'Автор', permissions: ['can_post'] } });
    expect(role.status).toBe(201);
    const assign = await api('PATCH', `/api/groups/${group.id}/members/${member.user.id}/custom-role`, {
      headers: owner.auth, body: { roleId: role.json.data.role.id },
    });
    expect(assign.status).toBe(200);

    const ok = await api('POST', `/api/groups/${group.id}/posts`, { headers: member.auth, body: { content: 'hi' } });
    expect(ok.status).toBe(201);
  });

  it('отклоняет неизвестное право и не даёт выдать чужое', async () => {
    const { owner, group } = await makeGroup();
    const bad = await api('POST', `/api/groups/${group.id}/roles`, { headers: owner.auth, body: { name: 'X', permissions: ['root'] } });
    expect(bad.status).toBe(400);

    const mod = await addMember(group.id, 'moderator');
    const escalate = await api('POST', `/api/groups/${group.id}/roles`, { headers: mod.auth, body: { name: 'Y', permissions: ['can_post'] } });
    expect(escalate.status).toBe(403); // у модератора нет can_manage_roles
  });
});

describe('группа: передача владения', () => {
  beforeEach(resetDb);

  it('владелец передаёт группу участнику и остаётся админом', async () => {
    const { owner, group } = await makeGroup();
    const member = await addMember(group.id);
    const res = await api('POST', `/api/groups/${group.id}/transfer-owner`, { headers: owner.auth, body: { userId: member.user.id } });
    expect(res.status).toBe(200);
    const g = await prisma.group.findUnique({ where: { id: group.id } });
    expect(g?.owner_id).toBe(member.user.id);
    const rows = await prisma.groupMember.findMany({ where: { group_id: group.id } });
    expect(rows.find((r) => r.user_id === member.user.id)?.role).toBe('owner');
    expect(rows.find((r) => r.user_id === owner.user.id)?.role).toBe('admin');
  });

  it('не-владелец не может передать группу', async () => {
    const { group } = await makeGroup();
    const a = await addMember(group.id, 'admin');
    const b = await addMember(group.id);
    const res = await api('POST', `/api/groups/${group.id}/transfer-owner`, { headers: a.auth, body: { userId: b.user.id } });
    expect(res.status).toBe(403);
  });
});

describe('закрытая группа: заявки', () => {
  beforeEach(resetDb);

  it('вступление создаёт заявку, одобрение делает участником', async () => {
    const { owner, group } = await makeGroup(false);
    const user = await createUser();
    const join = await api('POST', `/api/groups/${group.id}/join`, { headers: user.auth, body: { message: 'пустите' } });
    expect(join.status).toBe(200);
    expect(join.json.data.pending).toBe(true);
    expect(await prisma.groupMember.count({ where: { group_id: group.id, user_id: user.user.id } })).toBe(0);

    const list = await api('GET', `/api/groups/${group.id}/join-requests`, { headers: owner.auth });
    expect(list.json.data.requests).toHaveLength(1);
    const reqId = list.json.data.requests[0].id;

    const approve = await api('POST', `/api/groups/${group.id}/join-requests/${reqId}`, { headers: owner.auth, body: { approve: true } });
    expect(approve.status).toBe(200);
    expect(await prisma.groupMember.count({ where: { group_id: group.id, user_id: user.user.id } })).toBe(1);
    expect((await prisma.group.findUnique({ where: { id: group.id } }))?.members_count).toBe(2);
  });

  it('посторонний не видит посты закрытой группы', async () => {
    const { group } = await makeGroup(false);
    const stranger = await createUser();
    const res = await api('GET', `/api/groups/${group.id}/posts`, { headers: stranger.auth });
    expect(res.status).toBe(403);
  });

  it('обычный участник не видит заявки', async () => {
    const { group } = await makeGroup(false);
    const member = await addMember(group.id);
    const res = await api('GET', `/api/groups/${group.id}/join-requests`, { headers: member.auth });
    expect(res.status).toBe(403);
  });
});

describe('группа: отзывы и пожертвования', () => {
  beforeEach(resetDb);

  it('отзыв только от участника, повторный отзыв обновляет прежний', async () => {
    const { group } = await makeGroup();
    const stranger = await createUser();
    const denied = await api('POST', `/api/groups/${group.id}/reviews`, { headers: stranger.auth, body: { rating: 5, text: 'супер' } });
    expect(denied.status).toBe(403);

    const member = await addMember(group.id);
    await api('POST', `/api/groups/${group.id}/reviews`, { headers: member.auth, body: { rating: 5, text: 'супер' } });
    await api('POST', `/api/groups/${group.id}/reviews`, { headers: member.auth, body: { rating: 3, text: 'норм' } });
    const list = await api('GET', `/api/groups/${group.id}/reviews`);
    expect(list.json.data.total).toBe(1);
    expect(list.json.data.reviews[0].rating).toBe(3);
  });

  it('снятие карты выключает пожертвования, а включить их без карты нельзя', async () => {
    const { owner, group } = await makeGroup();
    await prisma.group.update({ where: { id: group.id }, data: { bank_card_masked: '**** 4242', donations_enabled: true } });
    const res = await api('PATCH', `/api/groups/${group.id}`, { headers: owner.auth, body: { bankCardMasked: null } });
    expect(res.status).toBe(200);
    const g = await prisma.group.findUnique({ where: { id: group.id } });
    expect(g?.donations_enabled).toBe(false);
    const again = await api('PATCH', `/api/groups/${group.id}`, { headers: owner.auth, body: { donationsEnabled: true } });
    expect(again.status).toBe(400);
  });

  it('занятый slug даёт 409', async () => {
    const { owner, group } = await makeGroup();
    const res = await api('POST', `/api/groups`, { headers: owner.auth, body: { name: 'Dup', slug: group.slug, type: 'static' } });
    expect(res.status).toBe(409);
  });
});
