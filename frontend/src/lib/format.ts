// Общие форматтеры дат, чисел и цен. Раньше каждый компонент держал свою копию
// formatDate/formatPrice/formatNum — здесь единственная реализация, а различия
// между экранами задаются параметрами (локаль, пресет, суффиксы).

import { utcToZonedParts } from '@/lib/timezone'

type DateInput = string | number | Date

// ── Даты ──────────────────────────────────────────────────────────────────────

export const DATE_PRESETS = {
  /** 5 мар. */
  short:      { day: 'numeric', month: 'short' },
  /** 5 марта */
  dayMonth:   { day: 'numeric', month: 'long' },
  /** 5 мар. 2026 г. */
  medium:     { day: 'numeric', month: 'short', year: 'numeric' },
  /** 5 марта 2026 г. */
  long:       { day: 'numeric', month: 'long', year: 'numeric' },
  /** 05 марта 2026 г. */
  longPadded: { day: '2-digit', month: 'long', year: 'numeric' },
  /** 05.03.2026 */
  numeric:    { day: '2-digit', month: '2-digit', year: 'numeric' },
  /** 05.03.26 */
  numericShort: { day: '2-digit', month: '2-digit', year: '2-digit' },
} satisfies Record<string, Intl.DateTimeFormatOptions>

export type DatePreset = keyof typeof DATE_PRESETS

/** Дата по пресету. locale = undefined → локаль браузера. */
export function formatDate(d: DateInput, preset: DatePreset = 'long', locale?: string): string {
  return new Date(d).toLocaleDateString(locale, DATE_PRESETS[preset])
}

/** 14:05 */
export function formatClock(d: DateInput, locale?: string): string {
  return new Date(d).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
}

export interface RelativeSuffixes { s: string; m: string; h: string; d: string }

const RU_SUFFIXES: RelativeSuffixes = { s: 'с', m: 'м', h: 'ч', d: 'д' }

export interface RelativeShortOptions {
  /** Суффиксы «5с / 3м / 2ч / 4д». По умолчанию русские. */
  suffixes?: RelativeSuffixes
  /** Сколько дней показывать «Nд» до перехода на дату. 1 → после суток сразу дата. По умолчанию — всегда «Nд». */
  maxDays?: number
  /** Формат даты, когда maxDays превышен. */
  datePreset?: DatePreset
  locale?: string
}

/** Компактное «сколько прошло»: 42с, 5м, 3ч, 2д — либо дата, если прошло больше maxDays. */
export function formatRelativeShort(d: DateInput, opts: RelativeShortOptions = {}): string {
  const { suffixes = RU_SUFFIXES, maxDays = Infinity, datePreset = 'short', locale } = opts
  const date = new Date(d)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}${suffixes.s}`
  if (diff < 3600) return `${Math.floor(diff / 60)}${suffixes.m}`
  if (diff < 86400) return `${Math.floor(diff / 3600)}${suffixes.h}`
  const days = Math.floor(diff / 86400)
  if (days < maxDays) return `${days}${suffixes.d}`
  return formatDate(date, datePreset, locale)
}

/** Время запланированной публикации в её собственном часовом поясе: «2026-03-05 14:00 (Europe/Moscow)». */
export function formatScheduled(p: { scheduled_at?: string | null; timezone?: string | null }): string {
  if (!p.scheduled_at) return ''
  const tz = p.timezone || 'UTC'
  const { date, time } = utcToZonedParts(p.scheduled_at, tz)
  return `${date} ${time} (${tz})`
}

// ── Числа и цены ──────────────────────────────────────────────────────────────

/** 950 → «950», 1234 → «1.2k» */
export function formatCompactNumber(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/**
 * Цена с символом валюты: 1 500 ₽, $15, €15, иначе «15 GBP».
 * fractionDigits задаёт точное число знаков после запятой (например 2 для стикеров);
 * без него дробная часть выводится как есть.
 */
export function formatPrice(price: string | number, currency: string, fractionDigits?: number): string {
  const n = parseFloat(String(price))
  const opts: Intl.NumberFormatOptions = fractionDigits === undefined
    ? {}
    : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }
  if (currency === 'RUB') return `${n.toLocaleString('ru-RU', opts)} ₽`
  if (currency === 'USD') return `$${n.toLocaleString('en-US', opts)}`
  if (currency === 'EUR') return `€${n.toLocaleString('de-DE', opts)}`
  return `${n.toLocaleString(undefined, opts)} ${currency}`
}
