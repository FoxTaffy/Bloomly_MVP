import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

export type WalletEntryKind =
  | 'topup' | 'subscription' | 'sticker_purchase' | 'sticker_sale'
  | 'shop_purchase' | 'shop_sale' | 'group_donation' | 'dev_topup' | 'refund_clawback'
  | 'order_escrow' | 'order_payout' | 'order_refund'
  | 'promo_grant' | 'promo_spend' | 'den_bump' | 'ad_banner' | 'ad_refund';

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

// ── Промо-баланс ─────────────────────────────────────────────────────────────
// Бонусные BLM (кэшбэк подписок). Живут отдельно от `balance`: debitWallet/creditWallet их не видят,
// поэтому донаты, покупки, эскроу и вывод не могут потратить промо. Потратить его можно только через
// debitPromo / debitForPromoEligible — их вызывают услуги площадки (баннеры, поднятия, бусты).

async function recordPromo(tx: Tx, userId: string, signed: Prisma.Decimal, balanceAfter: Prisma.Decimal, entry: WalletEntry) {
  await tx.walletTransaction.create({
    data: {
      user_id: userId, amount: signed, balance_after: balanceAfter, balance_type: 'promo',
      kind: entry.kind, ref_id: entry.refId ?? null,
    },
  });
}

/** Начислить промо-BLM. Как и creditWallet — только внутри транзакции вместе с тем, за что начисляют. */
export async function creditPromo(tx: Tx, userId: string, amount: number, entry: WalletEntry) {
  const money = toMoney(amount);
  await tx.wallet.createMany({ data: [{ user_id: userId }], skipDuplicates: true });
  const wallet = await tx.wallet.update({
    where: { user_id: userId }, data: { promo_balance: { increment: money } }, select: { promo_balance: true },
  });
  await recordPromo(tx, userId, money, wallet.promo_balance, entry);
  return wallet.promo_balance;
}

/** Списать только с промо-баланса. Условие `promo_balance >= amount` проверяет сам UPDATE — в минус не уйти. */
export async function debitPromo(tx: Tx, userId: string, amount: number, entry: WalletEntry, insufficientMessage = 'INSUFFICIENT_FUNDS') {
  const money = toMoney(amount);
  const debited = await tx.wallet.updateMany({
    where: { user_id: userId, promo_balance: { gte: money } },
    data: { promo_balance: { decrement: money } },
  });
  if (debited.count === 0) throw Object.assign(new Error(insufficientMessage), { statusCode: 402 });
  const wallet = await tx.wallet.findUniqueOrThrow({ where: { user_id: userId }, select: { promo_balance: true } });
  await recordPromo(tx, userId, money.neg(), wallet.promo_balance, entry);
  return wallet.promo_balance;
}

/**
 * Списание за услугу площадки: сначала промо-баланс, недостающее — с основного. Строка кошелька блокируется
 * (FOR UPDATE), поэтому доля промо и основного считается по неизменному остатку, а параллельное списание
 * ждёт своей очереди. В журнал уходит по записи на каждый затронутый баланс (balance_type promo / main).
 * Не хватает суммы двух балансов — 402 и откат всей транзакции.
 */
export async function debitForPromoEligible(tx: Tx, userId: string, amount: number, entry: WalletEntry, insufficientMessage = 'INSUFFICIENT_FUNDS') {
  const money = toMoney(amount);
  const rows = await tx.$queryRaw<{ balance: Prisma.Decimal; promo_balance: Prisma.Decimal }[]>`
    SELECT "balance", "promo_balance" FROM "Wallet" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
  const held = rows[0];
  if (!held || held.balance.add(held.promo_balance).lt(money)) {
    throw Object.assign(new Error(insufficientMessage), { statusCode: 402 });
  }
  const promoPart = held.promo_balance.lt(money) ? held.promo_balance : money;
  const mainPart = money.sub(promoPart);

  const wallet = await tx.wallet.update({
    where: { user_id: userId },
    data: { promo_balance: { decrement: promoPart }, balance: { decrement: mainPart } },
    select: { balance: true, promo_balance: true },
  });
  if (promoPart.gt(0)) await recordPromo(tx, userId, promoPart.neg(), wallet.promo_balance, entry);
  if (mainPart.gt(0)) {
    await tx.walletTransaction.create({
      data: { user_id: userId, amount: mainPart.neg(), balance_after: wallet.balance, kind: entry.kind, ref_id: entry.refId ?? null },
    });
  }
  return { promoSpent: promoPart, mainSpent: mainPart, balance: wallet.balance, promoBalance: wallet.promo_balance };
}
