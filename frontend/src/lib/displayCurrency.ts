import { ref } from 'vue'

/**
 * Показ цен в валюте региона оплаты из настроек. Только отображение: списание идёт
 * в валюте самого товара, поэтому сконвертированные суммы выводятся с «≈».
 * Регион «Другое» (GLOBAL) и гости — цены как есть.
 */
export const REGION_CURRENCY: Record<string, string> = {
  RU: 'RUB', US: 'USD', EU: 'EUR', CN: 'CNY', IN: 'INR', BR: 'BRL',
}

/** Валюта показа или null, если конвертация выключена. Ref — чтобы шаблоны перерисовывались. */
export const displayCurrency = ref<string | null>(null)
/** ₽ за 1 единицу валюты (RUB = 1). */
export const displayRates = ref<Record<string, number>>({})

let loading: Promise<void> | null = null
async function loadRates() {
  if (Object.keys(displayRates.value).length > 1) return
  // api подгружаем лениво: он тянет stores/auth, а форматтеры нужны почти везде
  loading ??= import('@/api').then(m => m.default.get('/payments/display-rates'))
    .then(r => { displayRates.value = r.data?.data?.rates ?? {} })
    .catch(() => { loading = null })
  await loading
}

export function setDisplayRegion(region?: string | null) {
  const cur = region ? REGION_CURRENCY[region] ?? null : null
  displayCurrency.value = cur
  if (cur) void loadRates()
}

/** Сумма в валюте показа или null, если конвертировать нельзя. */
export function convertForDisplay(amount: number, from: string): { amount: number; currency: string } | null {
  const to = displayCurrency.value
  if (!to || to === from) return null
  const r = displayRates.value
  if (!r[from] || !r[to]) return null
  return { amount: (amount * r[from]) / r[to], currency: to }
}
