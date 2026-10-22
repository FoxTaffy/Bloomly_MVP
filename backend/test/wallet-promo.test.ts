import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createUser, resetDb, api, getApp, prisma } from './helpers.js';
import { creditPromo, debitPromo, debitWallet, debitForPromoEligible } from '../src/modules/wallet/ledger.js';

async function fund(userId: string, balance: number, promo: number) {
  await prisma.wallet.create({ data: { user_id: userId, balance, promo_balance: promo } });
}
async function state(userId: string) {
  const w = await prisma.wallet.findUniqueOrThrow({ where: { user_id: userId } });
  return { balance: Number(w.balance), promo: Number(w.promo_balance) };
}
const status = (e: unknown) => (e as { statusCode?: number })?.statusCode;

describe('wallet: промо-баланс', () => {
  beforeAll(() => getApp());
  beforeEach(resetDb);

  it('creditPromo пополняет только промо и пишет журнал типа promo', async () => {
    const { user } = await createUser();
    await fund(user.id, 10, 0);
    const after = await prisma.$transaction((tx) => creditPromo(tx, user.id, 2, { kind: 'promo_grant', refId: 'sub-1' }));
    expect(Number(after)).toBe(2);
    expect(await state(user.id)).toEqual({ balance: 10, promo: 2 });
    const rows = await prisma.walletTransaction.findMany({ where: { user_id: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ balance_type: 'promo', kind: 'promo_grant', ref_id: 'sub-1' });
    expect(Number(rows[0].amount)).toBe(2);
    expect(Number(rows[0].balance_after)).toBe(2);
  });

  it('debitPromo не уводит промо в минус и откатывает транзакцию', async () => {
    const { user } = await createUser();
    await fund(user.id, 100, 1);
    const err = await prisma.$transaction((tx) => debitPromo(tx, user.id, 1.01, { kind: 'promo_spend' })).catch((e) => e);
    expect(status(err)).toBe(402);
    expect(await state(user.id)).toEqual({ balance: 100, promo: 1 }); // основной баланс не тронут
    expect(await prisma.walletTransaction.count()).toBe(0);
  });

  it('debitWallet промо не видит: при пустом основном балансе списание отклоняется', async () => {
    const { user } = await createUser();
    await fund(user.id, 0, 50);
    const err = await prisma.$transaction((tx) => debitWallet(tx, user.id, 1, { kind: 'shop_purchase' })).catch((e) => e);
    expect(status(err)).toBe(402);
    expect(await state(user.id)).toEqual({ balance: 0, promo: 50 });
  });

  it('debitForPromoEligible: сначала промо, остаток — с основного, по записи на каждый баланс', async () => {
    const { user } = await createUser();
    await fund(user.id, 10, 3);
    const res = await prisma.$transaction((tx) => debitForPromoEligible(tx, user.id, 5, { kind: 'promo_spend', refId: 'bump-1' }));
    expect([Number(res.promoSpent), Number(res.mainSpent)]).toEqual([3, 2]);
    expect(await state(user.id)).toEqual({ balance: 8, promo: 0 });
    const rows = await prisma.walletTransaction.findMany({ where: { user_id: user.id }, orderBy: { balance_type: 'asc' } });
    expect(rows.map((r) => [r.balance_type, Number(r.amount), Number(r.balance_after)])).toEqual([
      ['main', -2, 8],
      ['promo', -3, 0],
    ]);
  });

  it('debitForPromoEligible: промо хватает — основной не трогается и записи о нём нет', async () => {
    const { user } = await createUser();
    await fund(user.id, 10, 3);
    await prisma.$transaction((tx) => debitForPromoEligible(tx, user.id, 2, { kind: 'promo_spend' }));
    expect(await state(user.id)).toEqual({ balance: 10, promo: 1 });
    const rows = await prisma.walletTransaction.findMany({ where: { user_id: user.id } });
    expect(rows.map((r) => r.balance_type)).toEqual(['promo']);
  });

  it('debitForPromoEligible: не хватает суммы двух балансов — 402 и ничего не списано', async () => {
    const { user } = await createUser();
    await fund(user.id, 10, 3);
    const err = await prisma.$transaction((tx) => debitForPromoEligible(tx, user.id, 13.01, { kind: 'promo_spend' })).catch((e) => e);
    expect(status(err)).toBe(402);
    expect(await state(user.id)).toEqual({ balance: 10, promo: 3 });
    expect(await prisma.walletTransaction.count()).toBe(0);
  });

  it('debitForPromoEligible: нет кошелька — 402', async () => {
    const { user } = await createUser();
    const err = await prisma.$transaction((tx) => debitForPromoEligible(tx, user.id, 1, { kind: 'promo_spend' })).catch((e) => e);
    expect(status(err)).toBe(402);
  });

  it('дробные суммы точны: 0.5 и 0.01 без float-хвостов', async () => {
    const { user } = await createUser();
    await fund(user.id, 0.51, 0.5);
    await prisma.$transaction((tx) => debitForPromoEligible(tx, user.id, 0.5, { kind: 'promo_spend' }));
    await prisma.$transaction((tx) => debitForPromoEligible(tx, user.id, 0.01, { kind: 'promo_spend' }));
    expect(await state(user.id)).toEqual({ balance: 0.5, promo: 0 });
  });

  it('гонка debitForPromoEligible: 5 списаний по 0.5 при 2 BLM в сумме — проходят ровно 4', async () => {
    const { user } = await createUser();
    await fund(user.id, 1, 1);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => prisma.$transaction((tx) => debitForPromoEligible(tx, user.id, 0.5, { kind: 'promo_spend' }))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(failed.map((r) => status(r.reason))).toEqual([402]);
    expect(await state(user.id)).toEqual({ balance: 0, promo: 0 });
    expect(await prisma.walletTransaction.count()).toBe(4);
  });

  it('гонка debitPromo: 5 списаний по 0.5 при 1 промо — проходят ровно 2, минуса нет', async () => {
    const { user } = await createUser();
    await fund(user.id, 0, 1);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => prisma.$transaction((tx) => debitPromo(tx, user.id, 0.5, { kind: 'promo_spend' }))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect((await state(user.id)).promo).toBe(0);
  });

  it('смешанная гонка: debitForPromoEligible и debitWallet вместе не уводят основной баланс в минус', async () => {
    const { user } = await createUser();
    await fund(user.id, 2, 1);
    const ops = [
      ...Array.from({ length: 3 }, () => prisma.$transaction((tx) => debitForPromoEligible(tx, user.id, 1, { kind: 'promo_spend' }))),
      ...Array.from({ length: 3 }, () => prisma.$transaction((tx) => debitWallet(tx, user.id, 1, { kind: 'shop_purchase' }))),
    ];
    const results = await Promise.allSettled(ops);
    const s = await state(user.id);
    expect(s.balance).toBeGreaterThanOrEqual(0);
    expect(s.promo).toBeGreaterThanOrEqual(0);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3); // всего было 3 BLM
    expect(s.balance + s.promo).toBe(0);
  });

  it('GET /api/wallet отдаёт balance и promo_balance', async () => {
    const { user, auth } = await createUser();
    await fund(user.id, 7.5, 2);
    const res = await api('GET', '/api/wallet', { headers: auth });
    expect(res.status).toBe(200);
    expect(Number(res.json.data.balance)).toBe(7.5);
    expect(Number(res.json.data.promo_balance)).toBe(2);
  });

  it('GET /api/wallet без кошелька: оба баланса нулевые', async () => {
    const { auth } = await createUser();
    const res = await api('GET', '/api/wallet', { headers: auth });
    expect(Number(res.json.data.balance)).toBe(0);
    expect(Number(res.json.data.promo_balance)).toBe(0);
  });
});
