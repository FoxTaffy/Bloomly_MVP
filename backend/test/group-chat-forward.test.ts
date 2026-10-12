import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { messageService } from '../src/modules/messages/service.js';

async function makeGroup(ownerId: string) {
  const tag = randomUUID().slice(0, 8);
  return prisma.group.create({
    data: { slug: `g-${tag}`, name: `Group ${tag}`, type: 'static', owner_id: ownerId },
  });
}

describe('group chat: только для участников', () => {
  beforeEach(resetDb);

  it('посторонний не читает и не пишет в чат группы', async () => {
    const owner = await createUser();
    const outsider = await createUser();
    const group = await makeGroup(owner.user.id);

    const read = await api('GET', `/api/groups/${group.id}/chat`, { headers: outsider.auth });
    expect(read.status).toBe(403);

    const write = await api('POST', `/api/groups/${group.id}/chat`, { headers: outsider.auth, body: { text: 'привет' } });
    expect(write.status).toBe(403);
  });

  it('аноним не читает чат, даже публичной группы', async () => {
    const owner = await createUser();
    const group = await makeGroup(owner.user.id);
    const res = await api('GET', `/api/groups/${group.id}/chat`);
    expect(res.status).toBe(401);
  });

  it('участник пишет и читает чат', async () => {
    const owner = await createUser();
    const member = await createUser();
    const group = await makeGroup(owner.user.id);
    await prisma.groupMember.create({ data: { group_id: group.id, user_id: member.user.id } });

    const write = await api('POST', `/api/groups/${group.id}/chat`, { headers: member.auth, body: { text: 'hi' } });
    expect(write.status).toBe(201);
    const read = await api('GET', `/api/groups/${group.id}/chat`, { headers: member.auth });
    expect(read.status).toBe(200);
  });
});

describe('messages: пересылка только из своих бесед', () => {
  beforeEach(resetDb);

  it('нельзя переслать сообщение из чужой беседы по UUID', async () => {
    const victim = await createUser();
    const victim2 = await createUser();
    const attacker = await createUser();

    const victimConv = await prisma.conversation.create({ data: { type: 'direct' } });
    await prisma.conversationParticipant.createMany({ data: [
      { conversation_id: victimConv.id, user_id: victim.user.id },
      { conversation_id: victimConv.id, user_id: victim2.user.id },
    ] });
    const secret = await prisma.message.create({
      data: { conversation_id: victimConv.id, sender_id: victim.user.id, type: 'text' },
    });

    const attackerConv = await prisma.conversation.create({ data: { type: 'direct' } });
    await prisma.conversationParticipant.create({ data: { conversation_id: attackerConv.id, user_id: attacker.user.id } });

    await expect(
      messageService.forwardMessage(secret.id, attackerConv.id, attacker.user.id, null, 'украдено'),
    ).rejects.toThrow();
  });
});
