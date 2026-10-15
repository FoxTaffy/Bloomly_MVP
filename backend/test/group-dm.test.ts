import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';

async function makeGroup(ownerId: string) {
  const tag = randomUUID().slice(0, 8);
  return prisma.group.create({
    data: { slug: `g-${tag}`, name: `Group ${tag}`, type: 'static', owner_id: ownerId },
  });
}

describe('group DM: «Написать в группу» (личная ветка участника)', () => {
  beforeEach(resetDb);

  it('повторный клик открывает тот же диалог, а не создаёт новый', async () => {
    const owner = await createUser();
    const member = await createUser();
    const group = await makeGroup(owner.user.id);
    await prisma.groupMember.create({ data: { group_id: group.id, user_id: member.user.id } });

    const first = await api('POST', `/api/groups/${group.id}/dm`, { headers: member.auth });
    expect(first.status).toBe(201);
    const convId = first.json.data.conversation.id;

    const second = await api('POST', `/api/groups/${group.id}/dm`, { headers: member.auth });
    expect(second.status).toBe(200);
    expect(second.json.data.conversation.id).toBe(convId);

    const rows = await prisma.conversation.count({ where: { group_id: group.id, group_dm_user_id: member.user.id } });
    expect(rows).toBe(1);
  });

  it('удалённый личный диалог с группой восстанавливается, а не даёт 404 навсегда', async () => {
    const owner = await createUser();
    const member = await createUser();
    const group = await makeGroup(owner.user.id);
    await prisma.groupMember.create({ data: { group_id: group.id, user_id: member.user.id } });

    const first = await api('POST', `/api/groups/${group.id}/dm`, { headers: member.auth });
    const convId = first.json.data.conversation.id;
    await prisma.conversation.update({ where: { id: convId }, data: { deleted_at: new Date() } });

    const again = await api('POST', `/api/groups/${group.id}/dm`, { headers: member.auth });
    expect(again.status).toBe(200);
    expect(again.json.data.conversation.id).toBe(convId);

    const restored = await prisma.conversation.findUnique({ where: { id: convId } });
    expect(restored?.deleted_at).toBeNull();
  });

  it('не участник получает 403 с понятным сообщением', async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const group = await makeGroup(owner.user.id);

    const res = await api('POST', `/api/groups/${group.id}/dm`, { headers: outsider.auth });
    expect(res.status).toBe(403);
    expect(res.json.error.message).toContain('участник');
  });
});
