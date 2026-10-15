import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';

async function makeGroupWithMember() {
  const owner = await createUser();
  const member = await createUser();
  const tag = randomUUID().slice(0, 8);
  const group = await prisma.group.create({
    data: { slug: `g-${tag}`, name: `Group ${tag}`, type: 'static', owner_id: owner.user.id },
  });
  await prisma.groupMember.createMany({
    data: [
      { group_id: group.id, user_id: owner.user.id, role: 'owner' },
      { group_id: group.id, user_id: member.user.id, role: 'member' },
    ],
  });
  return { owner, member, group };
}

describe('группа: смена роли участника', () => {
  beforeEach(resetDb);

  it('назначает роль из списка допустимых', async () => {
    const { owner, member, group } = await makeGroupWithMember();
    const res = await api('PATCH', `/api/groups/${group.id}/members/${member.user.id}/role`, {
      headers: owner.auth, body: { role: 'moderator' },
    });
    expect(res.status).toBe(200);
    const row = await prisma.groupMember.findUnique({ where: { group_id_user_id: { group_id: group.id, user_id: member.user.id } } });
    expect(row?.role).toBe('moderator');
  });

  it('отклоняет неизвестную роль и не пишет её в базу', async () => {
    const { owner, member, group } = await makeGroupWithMember();
    const res = await api('PATCH', `/api/groups/${group.id}/members/${member.user.id}/role`, {
      headers: owner.auth, body: { role: 'superadmin' },
    });
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe('INVALID_ROLE');
    const row = await prisma.groupMember.findUnique({ where: { group_id_user_id: { group_id: group.id, user_id: member.user.id } } });
    expect(row?.role).toBe('member');
  });
});
