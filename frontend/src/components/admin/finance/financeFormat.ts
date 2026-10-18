import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'

const locale = () => LANG_TO_LOCALE[useLangStore().currentLang]

export const rub = (n: number | null | undefined) => {
  const v = Number(n ?? 0)
  return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'RUB', maximumFractionDigits: Number.isInteger(v) ? 0 : 2 }).format(v)
}
export const bc = (n: number | null | undefined) =>
  `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(Number(n ?? 0))} BC`
export const num = (n: number | null | undefined) => new Intl.NumberFormat(locale()).format(Number(n ?? 0))
export const percent = (n: number | null | undefined) => (n == null ? '—' : `${n}%`)

/** 'YYYY-MM-DD' (московские сутки) → «5 окт». Дата берётся как есть, без сдвига часовых поясов. */
export const dayLabel = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(), { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
export const dateTime = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }) : '—'

// Цвета категорий. Взяты из проверенной палитры данных (тёмная тема): первые три слота проходят
// проверку на различимость (в том числе при дальтонизме) на фоне карточек админки. Подписи рядом с метками обязательны.
export const SERIES = { c1: '#3987e5', c2: '#d95926', c3: '#199e70' } as const
export const PURPOSE_COLOR = { subscription: SERIES.c1, topup: SERIES.c2, donation: SERIES.c3 } as const
export const TIER_COLOR: Record<string, string> = { lite: SERIES.c1, pro: SERIES.c2, business: SERIES.c3 }

export const STATUS_STYLE: Record<string, { glyph: string; cls: string }> = {
  succeeded: { glyph: '✓', cls: 'bg-emerald-500/15 text-emerald-300' },
  refunded: { glyph: '↩', cls: 'bg-rose-500/15 text-rose-300' },
  review: { glyph: '!', cls: 'bg-amber-500/15 text-amber-300' },
  pending: { glyph: '…', cls: 'bg-white/10 text-white/60' },
  expired: { glyph: '×', cls: 'bg-white/10 text-white/60' },
}
