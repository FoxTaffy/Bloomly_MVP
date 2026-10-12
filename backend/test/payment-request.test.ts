import { describe, it, expect, beforeEach } from 'vitest';
import { createUser, prisma, resetDb } from './helpers.js';
import { messageService } from '../src/modules/messages/service.js';

async function paymentRequest(convType: 'direct' | 'group', participants: string[], sender: string, metadata: Record<string, unknown>) {
  const conv = await prisma.conversation.create({ data: { type: convType, is_group: convType === 'group' } });
  await prisma.conversationParticipant.createMany({
    data: participants.map((user_id) => ({ conversation_id: conv.id, user_id })),
  });
  const msg = await prisma.message.create({
    data: { conversation_id: conv.id, sender_id: sender, type: 'payment_request', metadata: metadata as any },
  });
  return { conv, msg };
}

const confirmationsOf = (convId: string) =>
  prisma.message.count({ where: { conversation_id: convId, type: 'payment_confirmation' } });

describe('payment request: подтверждение оплаты', () => {
  beforeEach(resetDb);

  it('два параллельных подтверждения дают одно подтверждение оплаты', async () => {
    const seller = await createUser();
    const payer = await createUser();
    const { conv, msg } = await paymentRequest('direct', [seller.user.id, payer.user.id], seller.user.id,
      { amount: 100, description: 'заказ', status: 'pending' });

    const results = await Promise.allSettled([
      messageService.payPaymentRequest(msg.id, payer.user.id),
      messageService.payPaymentRequest(msg.id, payer.user.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await confirmationsOf(conv.id)).toBe(1);
  });

  it('в групповой беседе оплатить может только плательщик из запроса', async () => {
    const seller = await createUser();
    const payer = await createUser();
    const bystander = await createUser();
    const { conv, msg } = await paymentRequest('group', [seller.user.id, payer.user.id, bystander.user.id], seller.user.id,
      { amount: 50, description: 'взнос', status: 'pending', payer_id: payer.user.id });

    await expect(messageService.payPaymentRequest(msg.id, bystander.user.id)).rejects.toMatchObject({ statusCode: 403 });
    expect(await confirmationsOf(conv.id)).toBe(0);

    await messageService.payPaymentRequest(msg.id, payer.user.id);
    expect(await confirmationsOf(conv.id)).toBe(1);
  });

  it('повторная оплата уже оплаченного запроса отклоняется', async () => {
    const seller = await createUser();
    const payer = await createUser();
    const { msg } = await paymentRequest('direct', [seller.user.id, payer.user.id], seller.user.id,
      { amount: 10, description: 'x', status: 'paid' });
    await expect(messageService.payPaymentRequest(msg.id, payer.user.id)).rejects.toMatchObject({ statusCode: 400 });
  });
});
