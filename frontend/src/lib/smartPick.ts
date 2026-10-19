import { displayRates } from '@/lib/displayCurrency'
import { listingDiscount, discountedPrice } from '@/lib/listingDiscount'

// «Умный подбор» в Dealers' Den: набор ответов мастера подбора и их перевод в фильтры каталога.
export interface SmartPick {
  category: string          // 'all' или ключ категории
  type: '' | 'digital' | 'physical'
  kind: string              // '' или вид продажи
  sort: string
  budgetMin: number | null
  budgetMax: number | null
  budgetCurrency: string
  onlyDiscount: boolean
}

export const BUDGET_CURRENCIES = ['USD', 'EUR', 'RUB', 'GBP', 'JPY', 'CNY']

export function emptySmartPick(currency = 'USD'): SmartPick {
  return { category: 'all', type: '', kind: '', sort: 'newest', budgetMin: null, budgetMax: null, budgetCurrency: currency, onlyDiscount: false }
}

export function hasBudget(p: SmartPick) { return p.budgetMin !== null || p.budgetMax !== null }

/** Сколько ответов отличается от «всё равно» — для бейджа на кнопке. */
export function smartPickCount(p: SmartPick): number {
  return [p.category !== 'all', !!p.type, !!p.kind, hasBudget(p), p.onlyDiscount, p.sort !== 'newest'].filter(Boolean).length
}

/** Бюджет в валюте лота: тот же курс, что и для «≈»-цен. Без курса остаётся только своя валюта. */
export function convertAmount(amount: number, from: string, to: string): number | null {
  if (from === to) return amount
  const r = displayRates.value
  return r[from] && r[to] ? (amount * r[from]) / r[to] : null
}

/** { USD: [min, max], ... } для API — по одному диапазону на каждую валюту лотов. */
export function budgetRanges(p: SmartPick): Record<string, [number | null, number | null]> | undefined {
  if (!hasBudget(p)) return undefined
  const out: Record<string, [number | null, number | null]> = {}
  for (const cur of BUDGET_CURRENCIES) {
    const lo = p.budgetMin === null ? null : convertAmount(p.budgetMin, p.budgetCurrency, cur)
    const hi = p.budgetMax === null ? null : convertAmount(p.budgetMax, p.budgetCurrency, cur)
    if ((p.budgetMin !== null && lo === null) || (p.budgetMax !== null && hi === null)) continue
    out[cur] = [lo === null ? null : Math.floor(lo * 100) / 100, hi === null ? null : Math.ceil(hi * 100) / 100]
  }
  return out
}

type PriceLike = { price: string | number; currency: string; listing_kind: string; discount_percent?: number | null }

/** Те же условия на клиенте — для вкладок, которые грузятся целиком (мои, вишлист, черновики). */
export function matchesSmartPick(l: PriceLike, p: SmartPick): boolean {
  if (p.onlyDiscount && !listingDiscount(l)) return false
  const ranges = budgetRanges(p)
  if (ranges) {
    const r = ranges[l.currency]
    if (!r) return false
    const price = discountedPrice(l.price, listingDiscount(l))
    if (r[0] !== null && price < r[0]) return false
    if (r[1] !== null && price > r[1]) return false
  }
  return true
}
