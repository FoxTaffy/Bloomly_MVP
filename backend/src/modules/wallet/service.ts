import prisma from '../../config/prisma.js';

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
  const wallet = await prisma.wallet.upsert({
    where: { user_id: userId },
    update: { balance: { increment: clean } },
    create: { user_id: userId, balance: clean },
  });
  return { balance: wallet.balance };
}

export async function getWallet(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { user_id: userId } });
  return { balance: wallet?.balance ?? 0 };
}
