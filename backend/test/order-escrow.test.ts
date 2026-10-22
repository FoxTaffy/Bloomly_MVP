import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createUser, prisma, resetDb, api } from './helpers.js';
import { messageService } from '../src/modules/messages/service.js';
import { groupService } from '../src/modules/groups/service.js';

/** Группа с художником-владельцем, заказчиком и заказом со счётом в чате группы. */
async function setup(opts: { amount: number; currency: string; balance?: number }) {
  const owner = await createUser();
  const customer = await createUser();
  const tag = randomUUID().slice(0, 8);
  const group = await prisma.group.create({ data: { slug: `g-${tag}`, name: `G ${tag}`, type: 'static', owner_id: owner.user.id, business_enabled: true } });
  await prisma.groupMember.createMany({ data: [
    { group_id: group.id, user_id: owner.user.id, role: 'owner' },
    { group_id: group.id, user_id: customer.user.id },
  ] });
  const conv = await prisma.conversation.create({ data: { type: 'community', is_group: false, group_id: group.id, group_dm_user_id: customer.user.id } });
  await prisma.conversationParticipant.create({ data: { conversation_id: conv.id, user_id: customer.user.id } });
  const order = await prisma.order.create({
    data: {
      group_id: group.id, customer_id: customer.user.id, title: 'Парный YCH', conversation_id: conv.id,
      payment_status: 'unpaid', invoice_amount: opts.amount, invoice_currency: opts.currency,
    },
  });
  const invoice = await prisma.message.create({
    data: {
      conversation_id: conv.id, sender_id: owner.user.id, type: 'payment_request',
      metadata: { amount: opts.amount, currency: opts.currency, description: 'Оплата заказа', status: 'pending', orderId: order.id } as any,
    },
  });
  await prisma.order.update({ where: { id: order.id }, data: { invoice_message_id: invoice.id } });
  if (opts.balance != null) await prisma.wallet.create({ data: { user_id: customer.user.id, balance: opts.balance } });
  return { owner, customer, group, conv, order, invoice };
}

const balanceOf = async (userId: string) => Number((await prisma.wallet.findUnique({ where: { user_id: userId } }))?.balance ?? 0);

describe('заказ: оплата с кошелька и безопасная сделка', () => {
  beforeEach(resetDb);

  it('счёт на 10 $ при пустом балансе не оплачивается: 402, ни сообщений, ни отметки на заказе', async () => {
    const { customer, invoice, order, conv } = await setup({ amount: 10, currency: 'USD', balance: 0 });
    await expect(messageService.payPaymentRequest(invoice.id, customer.user.id))
      .rejects.toMatchObject({ statusCode: 402, code: 'INSUFFICIENT_FUNDS', details: { needed: 10, balance: 0 } });
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.payment_status).toBe('unpaid');
    expect(await prisma.message.count({ where: { conversation_id: conv.id, type: 'payment_confirmation' } })).toBe(0);
    expect((await prisma.message.findUnique({ where: { id: invoice.id } }))?.metadata).toMatchObject({ status: 'pending' });
  });

  it('без кошелька вообще тоже 402', async () => {
    const { customer, invoice } = await setup({ amount: 10, currency: 'USD' });
    await expect(messageService.payPaymentRequest(invoice.id, customer.user.id)).rejects.toMatchObject({ statusCode: 402 });
  });

  it('ответ API при нехватке денег — 402 с кодом INSUFFICIENT_FUNDS', async () => {
    const { customer, invoice } = await setup({ amount: 10, currency: 'USD', balance: 3 });
    const res = await api('POST', `/api/messages/messages/${invoice.id}/pay`, { headers: customer.auth });
    expect(res.status).toBe(402);
    expect(res.json.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(res.json.error.details).toMatchObject({ needed: 10, balance: 3 });
  });

  it('оплата списывает ровно 10 BLM, удерживает их на заказе и не платит художнику', async () => {
    const { customer, owner, invoice, order } = await setup({ amount: 10, currency: 'USD', balance: 25 });
    const { confirmation } = await messageService.payPaymentRequest(invoice.id, customer.user.id);
    expect(await balanceOf(customer.user.id)).toBe(15);
    expect(await balanceOf(owner.user.id)).toBe(0);
    const o = await prisma.order.findUnique({ where: { id: order.id } });
    expect(o).toMatchObject({ payment_status: 'reported', escrow_status: 'held' });
    expect(Number(o?.escrow_blm)).toBe(10);
    // В подтверждении — валюта счёта, а не «10 ₽»
    expect(confirmation.metadata).toMatchObject({ amount: 10, currency: 'USD', escrow: true });
    const ledger = await prisma.walletTransaction.findMany({ where: { user_id: customer.user.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ kind: 'order_escrow', ref_id: order.id });
  });

  it('счёт в рублях пересчитывается в BLM по курсу, а не 1 к 1', async () => {
    await prisma.blmRate.create({ data: { usd_rub: 90 } });
    const { customer, invoice, order } = await setup({ amount: 900, currency: 'RUB', balance: 50 });
    await messageService.payPaymentRequest(invoice.id, customer.user.id);
    expect(await balanceOf(customer.user.id)).toBe(40);
    expect(Number((await prisma.order.findUnique({ where: { id: order.id } }))?.escrow_blm)).toBe(10);
  });

  it('параллельная оплата списывает деньги один раз', async () => {
    const { customer, invoice } = await setup({ amount: 10, currency: 'USD', balance: 100 });
    const results = await Promise.allSettled([
      messageService.payPaymentRequest(invoice.id, customer.user.id),
      messageService.payPaymentRequest(invoice.id, customer.user.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(customer.user.id)).toBe(90);
  });

  it('художнику деньги приходят только после подтверждения заказчика, и только заказчиком', async () => {
    const { customer, owner, invoice, order } = await setup({ amount: 10, currency: 'USD', balance: 25 });
    await messageService.payPaymentRequest(invoice.id, customer.user.id);

    // работа ещё не готова
    await expect(groupService.confirmOrderCompletion(order.id, customer.user.id)).rejects.toMatchObject({ statusCode: 400 });
    await prisma.order.update({ where: { id: order.id }, data: { status: 'FINISHED' } });
    // художник сам себе не переведёт
    await expect(groupService.confirmOrderCompletion(order.id, owner.user.id)).rejects.toMatchObject({ statusCode: 403 });
    expect(await balanceOf(owner.user.id)).toBe(0);

    await groupService.confirmOrderCompletion(order.id, customer.user.id);
    expect(await balanceOf(owner.user.id)).toBe(10);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.escrow_status).toBe('released');

    // повторное подтверждение не платит второй раз
    await expect(groupService.confirmOrderCompletion(order.id, customer.user.id)).rejects.toMatchObject({ statusCode: 400 });
    expect(await balanceOf(owner.user.id)).toBe(10);
  });

  it('удаление заказа с удержанной оплатой возвращает деньги заказчику', async () => {
    const { customer, owner, invoice, order } = await setup({ amount: 10, currency: 'USD', balance: 25 });
    await messageService.payPaymentRequest(invoice.id, customer.user.id);
    expect(await balanceOf(customer.user.id)).toBe(15);
    await groupService.deleteOrder(order.id, owner.user.id);
    expect(await balanceOf(customer.user.id)).toBe(25);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))?.escrow_status).toBe('refunded');
  });
});

describe('заказ: ход работы', () => {
  beforeEach(resetDb);

  it('художник выкладывает этап, заказчик его видит, посторонний — нет', async () => {
    const { owner, customer, group, order } = await setup({ amount: 10, currency: 'USD' });
    const stranger = await createUser();

    await expect(groupService.addOrderProgress(group.id, order.id, customer.user.id, { text: 'сам себе' }))
      .rejects.toMatchObject({ statusCode: 403 });
    await expect(groupService.addOrderProgress(group.id, order.id, owner.user.id, {}))
      .rejects.toMatchObject({ statusCode: 400 });

    const entry = await groupService.addOrderProgress(group.id, order.id, owner.user.id, { text: 'Скетч готов', stage: 'SKETCH' });
    expect(entry.stage).toBe('SKETCH');

    expect(await groupService.getOrderProgress(group.id, order.id, customer.user.id)).toHaveLength(1);
    await expect(groupService.getOrderProgress(group.id, order.id, stranger.user.id)).rejects.toMatchObject({ statusCode: 403 });

    const notif = await prisma.notification.findMany({ where: { receiver_id: customer.user.id, type: 'den_order_progress' } });
    expect(notif).toHaveLength(1);
    expect(notif[0].sender_group_id).toBe(group.id);

    // второй этап, пока первое уведомление не прочитано, не плодит новых
    await groupService.addOrderProgress(group.id, order.id, owner.user.id, { text: 'Лайнарт' });
    expect(await prisma.notification.count({ where: { receiver_id: customer.user.id, type: 'den_order_progress' } })).toBe(1);
  });

  it('очередь работ показывает прогресс и оплату только персоналу и заказчику', async () => {
    const { owner, customer, group, order } = await setup({ amount: 10, currency: 'USD' });
    await prisma.groupTodoItem.create({ data: { group_id: group.id, title: 'Парный YCH', order_id: order.id } });
    await groupService.addOrderProgress(group.id, order.id, owner.user.id, { text: 'WIP' });
    const stranger = await createUser();

    const asOwner = await groupService.getTodoItems(group.id, owner.user.id);
    expect(asOwner[0].progress).toMatchObject({ count: 1 });
    const asCustomer = await groupService.getTodoItems(group.id, customer.user.id);
    expect(asCustomer[0].progress).toMatchObject({ count: 1 });
    const asStranger = await groupService.getTodoItems(group.id, stranger.user.id);
    expect(asStranger[0].progress).toBeNull();
    expect(asStranger[0].order).not.toHaveProperty('payment_status');
    expect(asStranger[0].order).not.toHaveProperty('escrow_status');
    const anon = await groupService.getTodoItems(group.id);
    expect(anon[0].progress).toBeNull();
  });
});
