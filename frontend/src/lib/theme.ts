import { PROFILE_THEMES } from '@/lib/utils'

/** Тарифы, на которых работает цветовая тема профиля (на free она заблокирована в настройках). */
const THEME_TIERS = new Set(['lite', 'pro', 'business'])

type ProfileTheme = (typeof PROFILE_THEMES)[string]

/** Тема по id; null для пустой/неизвестной/«по умолчанию» темы. */
export function themeOf(themeId?: string | null): ProfileTheme | null {
  if (!themeId || themeId === 'default') return null
  return PROFILE_THEMES[themeId] ?? null
}

/** Акцентный цвет темы по её id. */
export function themeAccentOf(themeId?: string | null): string | null {
  return themeOf(themeId)?.accent ?? null
}

/** Тема пользователя действует только на платном тарифе. */
export function activeTheme(themeId?: string | null, tier?: string | null): ProfileTheme | null {
  return THEME_TIERS.has(tier ?? 'free') ? themeOf(themeId) : null
}

const mix = (color: string, withColor: 'black' | 'white', pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, ${withColor})`

/**
 * Токены темы: акцентная палитра `--color-brand-accent*` (те же оттенки, что в style.css для
 * базового синего) и поверхности `--color-brand-bg/card/border/muted`.
 * Tailwind-классы (`bg-brand-accent/15`, `bg-brand-card` и т.д.) читают эти переменные, поэтому перекрашиваются без правок в компонентах.
 */
export function themeTokens({ accent, bg, cardBg }: ProfileTheme): Record<string, string> {
  return {
    // Поверхности: фон страницы, карточки/блоки и их границы тоже окрашены темой.
    '--color-brand-bg': bg,
    '--color-brand-card': cardBg,
    '--color-brand-border': `color-mix(in srgb, ${accent} 18%, ${cardBg})`,
    '--color-brand-muted': `color-mix(in srgb, ${accent} 28%, ${cardBg})`,
    '--color-brand-accent': accent,
    '--color-brand-accent-plus': mix(accent, 'black', 65),
    '--color-brand-accent-plus-plus': mix(accent, 'black', 30),
    '--color-brand-accent-minus': mix(accent, 'white', 50),
    '--color-brand-accent-minus-minus': mix(accent, 'white', 25),
    '--color-brand-accent-minus-minus-minus': mix(accent, 'white', 10),
  }
}

/** Свой фон (profile_bg_url): только http(s)-ссылка, возвращает значение для CSS `url(...)`. */
export function safeBgImage(url?: string | null): string | null {
  if (!url) return null
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) return null
  } catch { return null }
  return `url('${url.replace(/['"\\()\s]/g, encodeURIComponent)}')`
}

/** Свой фон доступен на Pro и Business (как загрузка в настройках). */
export function activeBgImage(url?: string | null, tier?: string | null): string | null {
  return tier === 'pro' || tier === 'business' ? safeBgImage(url) : null
}
