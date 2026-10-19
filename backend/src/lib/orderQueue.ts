import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Каждый заказ группы стоит в очереди работ (Todolist) отдельным пунктом.
 * Пункт связан с заказом (order_id), поэтому статус и этап синхронизируются в обе стороны.
 * Вызывать внутри той же транзакции, что и создание заказа, — иначе заказ может остаться без пункта.
 */
export async function linkOrderToQueue(tx: Tx, order: { id: string; group_id: string; title: string; status: string }) {
  const last = await tx.groupTodoItem.findFirst({
    where: { group_id: order.group_id, deleted_at: null },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  await tx.groupTodoItem.create({
    data: {
      group_id: order.group_id,
      title: order.title.slice(0, 200),
      status: order.status,
      position: (last?.position ?? -1) + 1,
      order_id: order.id,
    },
  });
}
