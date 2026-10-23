import prisma from '../../config/prisma.js';
import { debitForPromoEligible } from '../wallet/ledger.js';
import { perksFor } from '../payments/plan-perks.js';
import { monthStart } from '../dealers-den/feed.config.js';
import { POST_BOOST, HOUR_MS } from './boost.config.js';

const fail = (statusCode: number, code: string, message: string, details?: Record<string, unknown>) =>
  Object.assign(new Error(message), { statusCode, code, details });

export interface BoostInfo {
  priceBlm: number;
  freeTotal: number;
  freeLeft: number;
  durationHours: number;
  cooldownHours: number;
}

export async function getBoostInfo(userId: string): Promise<BoostInfo> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { subscription_tier: true } });
  const freeTotal = perksFor(user.subscription_tier).postBoostsPerMonth;
  const used = freeTotal
    ? await prisma.postBoost.count({ where: { user_id: userId, kind: 'free', created_at: { gte: monthStart(new Date()) } } })
    : 0;
  return {
    priceBlm: POST_BOOST.priceBlm,
    freeTotal,
    freeLeft: Math.max(0, freeTotal - used),
    durationHours: POST_BOOST.durationHours,
    cooldownHours: POST_BOOST.cooldownHours,
  };
}

/**
 * Буст своего поста: сначала бесплатный месячный лимит тарифа (Business — 10), затем BLM (промо-баланс идёт первым).
 * Всё под блокировкой пользователя в одной транзакции — быстрые клики не спишут дважды и не обойдут лимит.
 */
export async function boostPost(userId: string, postId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`post-boost:${userId}`}::text))`;
    const post = await tx.post.findFirst({
      where: { id: postId, author_id: userId, deleted_at: null },
      select: { id: true, is_archived: true, boosted_at: true, author: { select: { subscription_tier: true } } },
    });
    if (!post) throw fail(404, 'POST_NOT_FOUND', 'Post not found or not yours');
    if (post.is_archived) throw fail(409, 'POST_ARCHIVED', 'Архивный пост продвигать нельзя');

    const now = new Date();
    if (post.boosted_at) {
      const availableAt = new Date(post.boosted_at.getTime() + POST_BOOST.cooldownHours * HOUR_MS);
      if (availableAt > now) throw fail(429, 'BOOST_TOO_SOON', 'Этот пост недавно продвигали', { availableAt: availableAt.toISOString() });
    }

    const freeTotal = perksFor(post.author.subscription_tier).postBoostsPerMonth;
    const used = freeTotal
      ? await tx.postBoost.count({ where: { user_id: userId, kind: 'free', created_at: { gte: monthStart(now) } } })
      : 0;
    const isFree = used < freeTotal;
    let wallet: { balance: number; promoBalance: number } | null = null;
    if (!isFree) {
      const spent = await debitForPromoEligible(tx, userId, POST_BOOST.priceBlm, { kind: 'post_boost', refId: post.id }).catch((e) => {
        if ((e as { statusCode?: number }).statusCode === 402) {
          throw fail(402, 'INSUFFICIENT_FUNDS', 'Недостаточно BLM для буста', { needed: POST_BOOST.priceBlm });
        }
        throw e;
      });
      wallet = { balance: Number(spent.balance), promoBalance: Number(spent.promoBalance) };
    }

    const boostedUntil = new Date(now.getTime() + POST_BOOST.durationHours * HOUR_MS);
    const updated = await tx.post.update({
      where: { id: post.id },
      data: { boosted_at: now, boosted_until: boostedUntil },
      select: { id: true, boosted_at: true, boosted_until: true },
    });
    await tx.postBoost.create({ data: { post_id: post.id, user_id: userId, kind: isFree ? 'free' : 'paid', cost_blm: isFree ? 0 : POST_BOOST.priceBlm } });
    return {
      post: updated,
      boost: { kind: isFree ? 'free' as const : 'paid' as const, costBlm: isFree ? 0 : POST_BOOST.priceBlm, freeLeft: Math.max(0, freeTotal - used - (isFree ? 1 : 0)) },
      wallet,
    };
  });
}

/**
 * Продвигаемые сейчас посты для подмешивания наверх ленты. `where` — те же условия видимости, что у обычной ленты
 * (NSFW-режим, блокировки, приватность, скрытые посты); из свежих бустов случайно берётся feedSlots штук.
 */
export async function pickBoostedPosts<T extends { id: string }>(
  fetchPool: (take: number) => Promise<T[]>, excludeIds: ReadonlySet<string> = new Set(),
): Promise<T[]> {
  const pool = (await fetchPool(POST_BOOST.feedPool)).filter((p) => !excludeIds.has(p.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, POST_BOOST.feedSlots);
}
