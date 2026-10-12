import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb, api } from './helpers.js';

describe('messages: ключи беседы', () => {
  beforeEach(resetDb);

  async function setup() {
    const member = await createUser();
    const victim = await createUser();
    const outsider = await createUser();
    const conv = await prisma.conversation.create({ data: { type: 'group' } });
    await prisma.conversationParticipant.createMany({ data: [
      { conversation_id: conv.id, user_id: member.user.id },
      { conversation_id: conv.id, user_id: victim.user.id },
    ] });
    await (prisma as any).conversationKey.create({
      data: { conversation_id: conv.id, user_id: victim.user.id, encrypted_key: 'original-key' },
    });
    return { member, victim, outsider, conv };
  }

  it('участник не перезаписывает чужой ключ беседы', async () => {
    const { member, victim, conv } = await setup();
    const res = await api('PUT', `/api/messages/conversations/${conv.id}/keys`, {
      headers: member.auth, body: { keys: { [victim.user.id]: 'attacker-key' } },
    });
    expect(res.status).toBe(403);
    const row = await (prisma as any).conversationKey.findUnique({
      where: { conversation_id_user_id: { conversation_id: conv.id, user_id: victim.user.id } },
    });
    expect(row.encrypted_key).toBe('original-key');
  });

  it('ключ не задаётся посторонним пользователям', async () => {
    const { member, outsider, conv } = await setup();
    const res = await api('PUT', `/api/messages/conversations/${conv.id}/keys`, {
      headers: member.auth, body: { keys: { [outsider.user.id]: 'x' } },
    });
    expect(res.status).toBe(400);
  });

  it('участник обновляет свой ключ', async () => {
    const { member, conv } = await setup();
    const res = await api('PUT', `/api/messages/conversations/${conv.id}/keys`, {
      headers: member.auth, body: { keys: { [member.user.id]: 'my-key' } },
    });
    expect(res.status).toBe(200);
  });
});
