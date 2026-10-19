// Скидка на карточку Dealers' Den. В БД price — цена без скидки, discount_percent — процент 0–90.
export const MAX_DISCOUNT = 90
export const DISCOUNT_PRESETS = [10, 20, 30, 50]

// Скидка имеет смысл там, где есть фиксированная цена; у аукционов цену задают ставки.
const DISCOUNTABLE_KINDS = ['fixed', 'raffle', 'commission_queue']

export function supportsDiscount(kind: string): boolean {
  return DISCOUNTABLE_KINDS.includes(kind)
}

export function listingDiscount(l: { discount_percent?: number | null; listing_kind: string; price: string | number }): number {
  const d = Number(l.discount_percent ?? 0)
  if (!supportsDiscount(l.listing_kind) || !(d > 0) || !(Number(l.price) > 0)) return 0
  return Math.min(MAX_DISCOUNT, Math.round(d))
}

export function discountedPrice(price: string | number, percent: number): number {
  return Math.round(Number(price) * (100 - percent)) / 100
}

export function clampDiscount(v: unknown): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(MAX_DISCOUNT, Math.max(0, n)) : 0
}
