// Реклама за BLM: места, цены и сроки. Скидку по тарифу (Pro 15 %, Business 30 %) берём из payments/plan-perks.ts.

export const AD_PLACEMENTS = ['feed_top', 'groups_page', 'left_menu', 'right_column'] as const;
export type AdPlacement = typeof AD_PLACEMENTS[number];
export const AD_BILLINGS = ['day', 'week'] as const;
export type AdBilling = typeof AD_BILLINGS[number];

/** Обычная цена в BLM за сутки / за неделю (до скидки тарифа). Неделя выгоднее семи суток. */
export const AD_PRICES_BLM: Record<AdPlacement, Record<AdBilling, number>> = {
  feed_top:     { day: 3.5, week: 16 },
  groups_page:  { day: 3,   week: 13 },
  left_menu:    { day: 2,   week: 9 },
  right_column: { day: 1.5, week: 7 },
};

export const AD_BILLING_DAYS: Record<AdBilling, number> = { day: 1, week: 7 };
/** Сколько суток/недель можно купить за раз. */
export const AD_MAX_PERIODS: Record<AdBilling, number> = { day: 30, week: 12 };

export const isPlacement = (v: unknown): v is AdPlacement => (AD_PLACEMENTS as readonly unknown[]).includes(v);
export const isBilling = (v: unknown): v is AdBilling => (AD_BILLINGS as readonly unknown[]).includes(v);

/**
 * Цена покупки: база × периоды × (1 − скидка), округление вверх до сотых. Тот же расчёт на фронте (lib/adPricing.ts),
 * но списывает всегда сервер.
 */
export function adQuote(placement: AdPlacement, billing: AdBilling, periods: number, discountPct: number) {
  const base = Math.round(AD_PRICES_BLM[placement][billing] * periods * 100) / 100;
  const price = Math.ceil(base * (100 - discountPct) - 1e-6) / 100;
  return { placement, billing, periods, durationDays: AD_BILLING_DAYS[billing] * periods, base, discountPct, price };
}
