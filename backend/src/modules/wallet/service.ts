import prisma from '../../config/prisma.js';
import { creditWallet } from './ledger.js';

// No payment gateway is wired up yet — this is a free/demo top-up so the rest of the
// wallet-funded flows (group donations) can be exercised end-to-end. Capped per request
// to keep it from being a pointless infinite-money button.
const MIN_TOPUP = 1;
const MAX_TOPUP = 5000;

export async function topupWallet(userId: string, amount: number) {
  const clean = Math.round(amount * 100) / 100;
  if (!Number.isFinite(clean) || clean < MIN_TOPUP || clean > MAX_TOPUP) {
    throw Object.assign(new Error(`Amount must be between ${MIN_TOPUP} and ${MAX_TOPUP}`), { statusCode: 400 });
  }
  const balance = await prisma.$transaction((tx) => creditWallet(tx, userId, clean, { kind: 'dev_topup' }));
  return { balance };
}

export async function getWallet(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { user_id: userId } });
  // balance — основные средства (их можно вывести), promo_balance — бонусные: только на услуги площадки
  return { balance: wallet?.balance ?? 0, promo_balance: wallet?.promo_balance ?? 0 };
}
