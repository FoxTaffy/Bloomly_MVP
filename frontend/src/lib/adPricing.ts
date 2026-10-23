// Расчёт цены баннера для показа в окне покупки. Тот же расчёт, что в backend/modules/ads/ads.config.ts (adQuote):
// база × периоды × (1 − скидка тарифа), вверх до сотых. Списывает всегда сервер.

export type AdPlacement = 'feed_top' | 'groups_page' | 'left_menu' | 'right_column'
export type AdBilling = 'day' | 'week'

export interface AdPricing {
  tier: string
  /** Скидка тарифа, % (Pro 15, Business 30) */
  discountPct: number
  placements: { placement: AdPlacement; prices: Record<AdBilling, number> }[]
  billingDays: Record<AdBilling, number>
  maxPeriods: Record<AdBilling, number>
  balance: number
  promoBalance: number
}

export function adPrice(base: number, periods: number, discountPct: number): { base: number; price: number } {
  const total = Math.round(base * periods * 100) / 100
  return { base: total, price: Math.ceil(total * (100 - discountPct) - 1e-6) / 100 }
}
