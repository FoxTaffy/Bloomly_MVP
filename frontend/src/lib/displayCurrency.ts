import { ref } from 'vue'

/**
 * Показ цен в валюте региона оплаты из настроек. Только отображение: списание идёт
 * в валюте самого товара, поэтому сконвертированные суммы выводятся с «≈».
 * Регион «Другое» (GLOBAL) и гости — цены как есть.
 */
export const REGION_CURRENCY: Record<string, string> = {
  RU: 'RUB', US: 'USD', EU: 'EUR', CN: 'CNY', IN: 'INR', BR: 'BRL', KZ: 'KZT',
}

/** Страны еврозоны и соседей, которым показываем евро. */
const EURO_COUNTRIES = new Set([
  'AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK',
])
/** Страна из языкового тега (ru-RU → RU) → регион оплаты. */
const COUNTRY_REGION: Record<string, string> = { RU: 'RU', US: 'US', CN: 'CN', IN: 'IN', BR: 'BR', KZ: 'KZ' }
/** Язык без страны (ru, kk, de…) → регион оплаты. */
const LANGUAGE_REGION: Record<string, string> = {
  ru: 'RU', kk: 'KZ', en: 'US', zh: 'CN', hi: 'IN', pt: 'BR',
  de: 'EU', fr: 'EU', es: 'EU', it: 'EU', nl: 'EU', fi: 'EU', el: 'EU',
}

/**
 * Регион оплаты по языкам браузера, пока пользователь не выбрал его сам. Теги идут в порядке предпочтений.
 * Страна важнее языка (pt-PT → EU, en-GB не угадываем и идём к следующему тегу); нет совпадений — null.
 */
export function detectRegionFromLocale(languages: readonly string[]): string | null {
  for (const tag of languages) {
    const [lang, ...rest] = tag.replace(/_/g, '-').split('-')
    const country = rest.find(p => /^[A-Za-z]{2}$/.test(p))?.toUpperCase()
    if (country) {
      if (COUNTRY_REGION[country]) return COUNTRY_REGION[country]
      if (EURO_COUNTRIES.has(country)) return 'EU'
      continue
    }
    const byLang = LANGUAGE_REGION[lang.toLowerCase()]
    if (byLang) return byLang
  }
  return null
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : []
}

/** Валюта показа или null, если конвертация выключена. Ref — чтобы шаблоны перерисовывались. */
export const displayCurrency = ref<string | null>(null)
/** ₽ за 1 единицу валюты (RUB = 1). */
export const displayRates = ref<Record<string, number>>({})

let loading: Promise<void> | null = null
export async function loadRates() {
  if (Object.keys(displayRates.value).length > 1) return
  // api подгружаем лениво: он тянет stores/auth, а форматтеры нужны почти везде
  loading ??= import('@/api').then(m => m.default.get('/payments/display-rates'))
    .then(r => { displayRates.value = r.data?.data?.rates ?? {} })
    .catch(() => { loading = null })
  await loading
}

/** Явный регион из настроек главнее; без него (гости, не выбравшие регион) — по языку браузера. */
export function setDisplayRegion(region?: string | null) {
  const effective = region || detectRegionFromLocale(browserLanguages())
  const cur = effective ? REGION_CURRENCY[effective] ?? null : null
  displayCurrency.value = cur
  if (cur) void loadRates()
}

/** Сумма в валюте показа или null, если конвертировать нельзя. BLM считается как USD (1 BLM = 1 $). */
export function convertForDisplay(amount: number, from: string): { amount: number; currency: string } | null {
  const to = displayCurrency.value
  const src = from === 'BLM' ? 'USD' : from
  if (!to || to === src) return null
  const r = displayRates.value
  if (!r[src] || !r[to]) return null
  return { amount: (amount * r[src]) / r[to], currency: to }
}

/** BLM в валюте показа; для долларового региона — 1:1, без курсов. null, если валюта показа не выбрана или курсов ещё нет. */
export function blmToDisplay(amount: number): { amount: number; currency: string } | null {
  const to = displayCurrency.value
  if (!to) return null
  if (to === 'USD') return { amount, currency: 'USD' }
  return convertForDisplay(amount, 'BLM')
}
