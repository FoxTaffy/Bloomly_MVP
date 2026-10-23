import { PROFILE_THEMES } from '@/lib/utils'

/** Тарифы, на которых работает цветовая тема профиля (на free она заблокирована в настройках). */
const THEME_TIERS = new Set(['lite', 'pro', 'business'])

/** Акцентный цвет темы по её id; null для пустой/неизвестной/«по умолчанию» темы. */
export function themeAccentOf(themeId?: string | null): string | null {
  if (!themeId || themeId === 'default') return null
  return PROFILE_THEMES[themeId]?.accent ?? null
}

/** Тема пользователя действует только на платном тарифе. */
export function activeThemeAccent(themeId?: string | null, tier?: string | null): string | null {
  return THEME_TIERS.has(tier ?? 'free') ? themeAccentOf(themeId) : null
}

const mix = (color: string, withColor: 'black' | 'white', pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, ${withColor})`

/**
 * Палитра `--color-brand-accent*` из одного акцента — те же оттенки, что заданы в style.css
 * для базового синего. Tailwind-классы (`bg-brand-accent/15`, `from-brand-accent-plus` и т.д.)
 * читают эти переменные, поэтому перекрашиваются без правок в компонентах.
 */
export function accentTokens(accent: string): Record<string, string> {
  return {
    '--color-brand-accent': accent,
    '--color-brand-accent-plus': mix(accent, 'black', 65),
    '--color-brand-accent-plus-plus': mix(accent, 'black', 30),
    '--color-brand-accent-minus': mix(accent, 'white', 50),
    '--color-brand-accent-minus-minus': mix(accent, 'white', 25),
    '--color-brand-accent-minus-minus-minus': mix(accent, 'white', 10),
  }
}
