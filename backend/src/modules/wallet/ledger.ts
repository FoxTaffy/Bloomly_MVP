import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export type WalletEntryKind =
  | 'topup' | 'subscription' | 'sticker_purchase' | 'sticker_sale'
  | 'shop_purchase' | 'group_donation' | 'dev_topup' | 'refund_clawback';

export interface WalletEntry {
  kind: WalletEntryKind;
  /** Что стало причиной: id платежа / пака / товара / группы. */
  refId?: string;
}

/** Деньги — только в копейках: число из кода превращается в Decimal через строку, без float-хвостов. */
function toMoney(amount: number): Prisma.Decimal {
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('INVALID_AMOUNT'), { statusCode: 400 });
  const cents = Math.round(amount * 100);
  if (cents < 1 || cents > 99_999_999_99) throw Object.assign(new Error('INVALID_AMOUNT'), { statusCode: 400 });
  return new Prisma.Decimal(cents).div(100);
}

async function record(tx: Tx, userId: string, signed: Prisma.Decimal, entry: WalletEntry) {
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { user_id: userId }, select: { balance: true } });
  await tx.walletTransaction.create({
    data: { user_id: userId, amount: signed, balance_after: wallet.balance, kind: entry.kind, ref_id: entry.refId ?? null },
  });
  return wallet.balance;
}

/**
 * Единственный способ начислить Bloom. Вызывать ТОЛЬКО внутри транзакции вместе с тем, за что начисляют
 * (смена статуса платежа, продажа пака): запись журнала и баланс откатываются вместе.
 */
export async function creditWallet(tx: Tx, userId: string, amount: number, entry: WalletEntry) {
  const money = toMoney(amount);
  // Кошелёк создаётся при регистрации; для старых аккаунтов досоздаём без гонки (upsert под нагрузкой даёт P2002)
  await tx.wallet.createMany({ data: [{ user_id: userId }], skipDuplicates: true });
  await tx.wallet.update({ where: { user_id: userId }, data: { balance: { increment: money } } });
  return record(tx, userId, money, entry);
}

/**
 * Единственный способ списать Bloom. Условие `balance >= amount` проверяется самим UPDATE, поэтому
 * два параллельных списания не уведут баланс в минус. Нет денег — ошибка 402 и откат всей транзакции.
 */
export async function debitWallet(tx: Tx, userId: string, amount: number, entry: WalletEntry, insufficientMessage = 'INSUFFICIENT_FUNDS') {
  const money = toMoney(amount);
  const debited = await tx.wallet.updateMany({
    where: { user_id: userId, balance: { gte: money } },
    data: { balance: { decrement: money } },
  });
  if (debited.count === 0) throw Object.assign(new Error(insufficientMessage), { statusCode: 402 });
  return record(tx, userId, money.neg(), entry);
}
