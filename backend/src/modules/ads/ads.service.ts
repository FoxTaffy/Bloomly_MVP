import { Prisma } from '@prisma/client';
import prisma from '../../config/prisma.js';
import { normalizeSafeLink } from '../../lib/safeLink.js';
import { creditPromo, creditWallet, debitForPromoEligible } from '../wallet/ledger.js';
import { perksFor } from '../payments/plan-perks.js';
import {
  AD_BILLING_DAYS, AD_MAX_PERIODS, AD_PLACEMENTS, AD_PRICES_BLM, adQuote, isBilling, isPlacement,
} from './ads.config.js';

type Tx = Prisma.TransactionClient;

const fail = (statusCode: number, code: string, message: string, details?: Record<string, unknown>) =>
  Object.assign(new Error(message), { statusCode, code, details });

/** Скидка на баннеры по тарифу покупателя. */
async function discountFor(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { subscription_tier: true } });
  const tier = u?.subscription_tier ?? 'free';
  return { tier, discountPct: perksFor(tier).adDiscountPct };
}

/** Прайс для окна покупки: места, обычные цены, скидка этого пользователя и его балансы. */
export async function getAdPricing(userId: string) {
  const [{ tier, discountPct }, wallet] = await Promise.all([
    discountFor(userId),
    prisma.wallet.findUnique({ where: { user_id: userId }, select: { balance: true, promo_balance: true } }),
  ]);
  return {
    tier, discountPct,
    placements: AD_PLACEMENTS.map((placement) => ({ placement, prices: AD_PRICES_BLM[placement] })),
    billingDays: AD_BILLING_DAYS,
    maxPeriods: AD_MAX_PERIODS,
    balance: Number(wallet?.balance ?? 0),
    promoBalance: Number(wallet?.promo_balance ?? 0),
  };
}

export interface PurchaseAdInput {
  title: string; description?: string; imageUrl?: string; linkUrl: string; contactInfo?: string;
  placement?: unknown; billing?: unknown; periods?: unknown;
}

/**
 * Покупка баннера: цена со скидкой тарифа списывается сразу (сначала промо-баланс), заявка уходит на модерацию.
 * Срок показа отсчитывается от одобрения; при отказе деньги возвращаются в те же балансы, откуда ушли.
 */
export async function purchaseAd(userId: string, input: PurchaseAdInput) {
  if (!isPlacement(input.placement)) throw fail(400, 'INVALID_PLACEMENT', 'Выберите место размещения');
  if (!isBilling(input.billing)) throw fail(400, 'INVALID_BILLING', 'Выберите тариф: сутки или неделя');
  const periods = Number(input.periods);
  if (!Number.isInteger(periods) || periods < 1 || periods > AD_MAX_PERIODS[input.billing]) {
    throw fail(400, 'INVALID_PERIODS', `Срок — от 1 до ${AD_MAX_PERIODS[input.billing]}`);
  }
  // Ссылка рекламы показывается всем посетителям — javascript:-схему отсекаем на записи
  const linkUrl = normalizeSafeLink(input.linkUrl);
  if (!linkUrl) throw fail(400, 'INVALID_AD_LINK', 'Недопустимая ссылка рекламы: разрешены только http(s), mailto и tel');

  const { discountPct } = await discountFor(userId);
  const q = adQuote(input.placement, input.billing, periods, discountPct);

  return prisma.$transaction(async (tx) => {
    const ad = await tx.advertisement.create({
      data: {
        requester_id: userId, title: input.title, description: input.description, image_url: input.imageUrl,
        link_url: linkUrl, contact_info: input.contactInfo,
        placement: q.placement, billing: q.billing, periods: q.periods, duration_days: q.durationDays,
        price_blm: q.price, discount_pct: q.discountPct,
      },
    });
    const spent = await debitForPromoEligible(tx, userId, q.price, { kind: 'ad_banner', refId: ad.id }).catch((e) => {
      if ((e as { statusCode?: number }).statusCode === 402) {
        throw fail(402, 'INSUFFICIENT_FUNDS', 'Недостаточно BLM для оплаты рекламы', { needed: q.price });
      }
      throw e;
    });
    const paid = await tx.advertisement.update({
      where: { id: ad.id },
      data: { paid_main_blm: spent.mainSpent, paid_promo_blm: spent.promoSpent },
    });
    return {
      ad: paid, quote: q,
      wallet: { balance: Number(spent.balance), promoBalance: Number(spent.promoBalance) },
    };
  });
}

/** Возвращает оплату рекламы в те балансы, откуда она списана. Идемпотентно: второй вызов ничего не вернёт. */
export async function refundAd(tx: Tx, adId: string) {
  const claimed = await tx.advertisement.updateMany({
    where: { id: adId, refunded_at: null, requester_id: { not: null }, price_blm: { not: null } },
    data: { refunded_at: new Date() },
  });
  if (claimed.count === 0) return false;
  const ad = await tx.advertisement.findUniqueOrThrow({ where: { id: adId } });
  const main = Number(ad.paid_main_blm);
  const promo = Number(ad.paid_promo_blm);
  if (main > 0) await creditWallet(tx, ad.requester_id!, main, { kind: 'ad_refund', refId: ad.id });
  if (promo > 0) await creditPromo(tx, ad.requester_id!, promo, { kind: 'ad_refund', refId: ad.id });
  return true;
}

/**
 * Решение модератора. Одобрение запускает срок показа (с момента одобрения, если админ не задал даты сам);
 * отказ непоказанной заявки возвращает деньги. Решение принимается один раз: повторный вызов по уже
 * рассмотренной заявке только меняет её, не трогая оплату.
 */
export async function reviewPaidAd(
  adId: string, reviewerId: string, status: 'active' | 'rejected',
  options?: { startsAt?: Date; endsAt?: Date },
) {
  return prisma.$transaction(async (tx) => {
    const ad = await tx.advertisement.findUniqueOrThrow({ where: { id: adId } });
    const data: Prisma.AdvertisementUpdateInput = { status, reviewer: { connect: { id: reviewerId } }, updated_at: new Date() };
    if (status === 'active') {
      const start = options?.startsAt ?? ad.starts_at ?? new Date();
      data.starts_at = start;
      data.ends_at = options?.endsAt ?? (ad.duration_days ? new Date(start.getTime() + ad.duration_days * 86_400_000) : ad.ends_at);
    } else {
      data.starts_at = options?.startsAt;
      data.ends_at = options?.endsAt;
      if (ad.status === 'pending') await refundAd(tx, ad.id);
    }
    return tx.advertisement.update({ where: { id: adId }, data });
  });
}
