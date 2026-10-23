import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { debitForPromoEligible } from '../wallet/ledger.js';
import { logger } from '../../lib/logger.js';
import { DEN_FEED, HOUR_MS, canAutoBump, cooldownMs, freeBumpsFor, monthStart } from './feed.config.js';

type Tx = Prisma.TransactionClient;

const fail = (statusCode: number, code: string, message: string, details?: Record<string, unknown>) =>
  Object.assign(new Error(message), { statusCode, code, details });

/** Кулдаун считается на группу-продавца, а у лотов без группы — на продавца. */
const scopeOf = (l: { group_id: string | null; seller_id: string }) =>
  l.group_id ? { group_id: l.group_id } : { seller_id: l.seller_id, group_id: null };
const lockKey = (l: { group_id: string | null; seller_id: string }) => `den-feed:${l.group_id ?? l.seller_id}`;

async function lock(tx: Tx, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}::text))`;
}

/**
 * Пускает активную карточку в общую ленту, если кулдаун группы прошёл; иначе она остаётся в очереди
 * (в магазине группы видна сразу) и выйдет в ленту по cron. Вызывать при создании и публикации карточки.
 */
export async function placeInFeed(listingId: string): Promise<boolean> {
  const l = await prisma.dealerListing.findUnique({
    where: { id: listingId },
    select: { id: true, seller_id: true, group_id: true, status: true, deleted_at: true, feed_published_at: true, seller: { select: { subscription_tier: true } } },
  });
  if (!l || l.deleted_at || l.status !== 'active' || l.feed_published_at) return !!l?.feed_published_at;

  return prisma.$transaction(async (tx) => {
    await lock(tx, lockKey(l));
    const now = new Date();
    const recent = await tx.dealerListing.findFirst({
      where: { ...scopeOf(l), id: { not: l.id }, deleted_at: null, feed_published_at: { gt: new Date(now.getTime() - cooldownMs(l.seller.subscription_tier)) } },
      select: { id: true },
    });
    if (recent) return false;
    await tx.dealerListing.update({ where: { id: l.id }, data: { feed_published_at: now, feed_at: now } });
    return true;
  });
}

/** Cron: выпускает из очереди по одной карточке на группу, как только прошёл кулдаун (самые старые — первыми). */
export async function publishQueuedListings(): Promise<number> {
  const queued = await prisma.dealerListing.findMany({
    where: { status: 'active', deleted_at: null, feed_published_at: null },
    orderBy: { created_at: 'asc' },
    take: 500,
    select: { id: true },
  });
  let published = 0;
  for (const { id } of queued) {
    try { if (await placeInFeed(id)) published++; } catch (err) { logger.error({ err, id }, '[den-feed] publish failed'); }
  }
  return published;
}

export interface BumpInfo {
  priceBlm: number;
  freeTotal: number;
  freeLeft: number;
  minIntervalHours: number;
  canAutoBump: boolean;
  /** Через сколько новая карточка группы попадёт в общую ленту (мс); 0 — можно прямо сейчас. */
  cooldownHours: number;
}

export async function getBumpInfo(userId: string): Promise<BumpInfo> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { subscription_tier: true } });
  const tier = user.subscription_tier;
  const freeTotal = freeBumpsFor(tier);
  const used = freeTotal
    ? await prisma.denBump.count({ where: { user_id: userId, kind: 'free', created_at: { gte: monthStart(new Date()) } } })
    : 0;
  return {
    priceBlm: DEN_FEED.bumpPriceBlm,
    freeTotal,
    freeLeft: Math.max(0, freeTotal - used),
    minIntervalHours: DEN_FEED.bumpMinIntervalHours,
    canAutoBump: canAutoBump(tier),
    cooldownHours: cooldownMs(tier) / HOUR_MS,
  };
}

/**
 * Ручное поднятие: сначала бесплатный лимит подписки, затем BLM (промо-баланс идёт первым).
 * Всё в одной транзакции под блокировкой пользователя — два быстрых клика не спишут дважды и не обойдут лимит.
 */
export async function bumpListing(userId: string, listingId: string) {
  return prisma.$transaction(async (tx) => {
    await lock(tx, `den-bump:${userId}`);
    const l = await tx.dealerListing.findFirst({
      where: { id: listingId, seller_id: userId, deleted_at: null },
      select: { id: true, group_id: true, status: true, last_bumped_at: true, seller: { select: { subscription_tier: true } } },
    });
    if (!l) throw fail(404, 'LISTING_NOT_FOUND', 'Listing not found or not yours');
    if (l.status !== 'active') throw fail(409, 'LISTING_NOT_ACTIVE', 'Поднять можно только активную карточку');

    const now = new Date();
    if (l.last_bumped_at) {
      const availableAt = new Date(l.last_bumped_at.getTime() + DEN_FEED.bumpMinIntervalHours * HOUR_MS);
      if (availableAt > now) throw fail(429, 'BUMP_TOO_SOON', 'Эту карточку недавно поднимали', { availableAt: availableAt.toISOString() });
    }

    const freeTotal = freeBumpsFor(l.seller.subscription_tier);
    const used = freeTotal
      ? await tx.denBump.count({ where: { user_id: userId, kind: 'free', created_at: { gte: monthStart(now) } } })
      : 0;
    const isFree = used < freeTotal;
    let cost = 0;
    let wallet: { balance: number; promoBalance: number } | null = null;
    if (!isFree) {
      const spent = await debitForPromoEligible(tx, userId, DEN_FEED.bumpPriceBlm, { kind: 'den_bump', refId: l.id }).catch((e) => {
        if ((e as { statusCode?: number }).statusCode === 402) {
          throw fail(402, 'INSUFFICIENT_FUNDS', 'Недостаточно средств для поднятия', { needed: DEN_FEED.bumpPriceBlm });
        }
        throw e;
      });
      cost = DEN_FEED.bumpPriceBlm;
      wallet = { balance: Number(spent.balance), promoBalance: Number(spent.promoBalance) };
    }

    const listing = await tx.dealerListing.update({
      where: { id: l.id },
      // Поднятие карточки из очереди сразу выпускает её в ленту
      data: { feed_at: now, last_bumped_at: now, feed_published_at: now },
      select: { id: true, feed_at: true, feed_published_at: true, last_bumped_at: true },
    });
    await tx.denBump.create({ data: { listing_id: l.id, user_id: userId, group_id: l.group_id, kind: isFree ? 'free' : 'paid', cost_blm: cost } });
    return {
      listing,
      bump: { kind: isFree ? 'free' as const : 'paid' as const, costBlm: cost, freeLeft: Math.max(0, freeTotal - used - (isFree ? 1 : 0)) },
      wallet,
    };
  });
}

/** Включить/выключить автоподнятие карточки. Включить можно только на тарифе с этой функцией. */
export async function setAutoBump(userId: string, listingId: string, enabled: boolean) {
  const l = await prisma.dealerListing.findFirst({
    where: { id: listingId, seller_id: userId, deleted_at: null },
    select: { id: true, seller: { select: { subscription_tier: true } } },
  });
  if (!l) throw fail(404, 'LISTING_NOT_FOUND', 'Listing not found or not yours');
  if (enabled && !canAutoBump(l.seller.subscription_tier)) {
    throw fail(403, 'PLAN_REQUIRED', 'Автоподнятие доступно на тарифе Business');
  }
  return prisma.dealerListing.update({ where: { id: l.id }, data: { auto_bump: enabled }, select: { id: true, auto_bump: true } });
}

/**
 * Cron: возвращает наверх ленты карточки с автоподнятием. Тариф проверяется в момент запуска (кончился — флаг снимается),
 * на группу — не больше одного подъёма за autoBumpGroupGapHours; в очереди ожидающие карточки не трогаем, кулдаун их.
 */
export async function runAutoBumps(): Promise<number> {
  const now = new Date();
  const candidates = await prisma.dealerListing.findMany({
    where: {
      auto_bump: true, status: 'active', deleted_at: null, feed_published_at: { not: null },
      feed_at: { lte: new Date(now.getTime() - DEN_FEED.autoBumpIntervalHours * HOUR_MS) },
    },
    orderBy: { feed_at: 'asc' },
    take: 200,
    select: { id: true, seller_id: true, group_id: true, seller: { select: { subscription_tier: true } } },
  });
  const done = new Set<string>();
  let bumped = 0;
  for (const c of candidates) {
    const key = c.group_id ?? c.seller_id;
    if (done.has(key)) continue;
    if (!canAutoBump(c.seller.subscription_tier)) {
      await prisma.dealerListing.update({ where: { id: c.id }, data: { auto_bump: false } });
      continue;
    }
    const recent = await prisma.denBump.findFirst({
      where: { kind: 'auto', ...(c.group_id ? { group_id: c.group_id } : { user_id: c.seller_id, group_id: null }), created_at: { gt: new Date(now.getTime() - DEN_FEED.autoBumpGroupGapHours * HOUR_MS) } },
      select: { id: true },
    });
    if (recent) { done.add(key); continue; }
    try {
      await prisma.$transaction([
        prisma.dealerListing.update({ where: { id: c.id }, data: { feed_at: now, last_bumped_at: now } }),
        prisma.denBump.create({ data: { listing_id: c.id, user_id: c.seller_id, group_id: c.group_id, kind: 'auto', cost_blm: 0 } }),
      ]);
      bumped++;
    } catch (err) {
      logger.error({ err, id: c.id }, '[den-feed] auto-bump failed');
    }
    done.add(key);
  }
  return bumped;
}
