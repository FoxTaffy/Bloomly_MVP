/**
 * Форматирует число в сокращённый вид:
 * 15       → "15"
 * 1 000    → "1к"
 * 1 100    → "1.1к"
 * 10 000   → "10к"
 * 1 000 000 → "1кк"
 */
export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) {
    const v = n / 1000
    return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')) + 'к'
  }
  const v = n / 1_000_000
  return (Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1).replace(/\.0$/, '')) + 'кк'
}

/**
 * Возвращает путь к изображению темы профиля по её id
 */
export const PROFILE_THEMES: Record<string, { label: string; bg: string; accent: string; cardBg: string }> = {
  default: {
    label: 'По умолчанию',
    bg: '#0f1117',
    accent: '#4C79CF',
    cardBg: '#181c2a',
  },
  violet: {
    label: 'Фиолетовый',
    bg: '#110d1e',
    accent: '#9b5de5',
    cardBg: '#1a1228',
  },
  crimson: {
    label: 'Багровый',
    bg: '#120d0d',
    accent: '#e53e3e',
    cardBg: '#1e1212',
  },
  emerald: {
    label: 'Изумрудный',
    bg: '#0d1a13',
    accent: '#38a169',
    cardBg: '#121f17',
  },
  amber: {
    label: 'Янтарный',
    bg: '#18130a',
    accent: '#d97706',
    cardBg: '#1f1812',
  },
  ocean: {
    label: 'Океан',
    bg: '#0a1020',
    accent: '#0ea5e9',
    cardBg: '#0d1628',
  },
  sakura: {
    label: 'Сакура',
    bg: '#180f15',
    accent: '#ec4899',
    cardBg: '#1e121a',
  },
  night: {
    label: 'Ночь',
    bg: '#0a0a0a',
    accent: '#60a5fa',
    cardBg: '#111111',
  },
}

export const PROFILE_FRAMES: Record<string, { label: string; style: string }> = {
  none: { label: 'Нет', style: '' },
  default_ring: { label: 'Кольцо', style: 'ring-2 ring-brand-accent ring-offset-2 ring-offset-brand-bg' },
  gold: { label: 'Золото', style: 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-brand-bg' },
  neon: { label: 'Неон', style: 'ring-2 ring-pink-500 ring-offset-2 ring-offset-brand-bg shadow-[0_0_12px_2px_rgba(236,72,153,0.7)]' },
  rainbow: { label: 'Радуга', style: 'ring-2 ring-offset-2 ring-offset-brand-bg' },
  silver: { label: 'Серебро', style: 'ring-2 ring-slate-300 ring-offset-2 ring-offset-brand-bg' },
  fire: { label: 'Огонь', style: 'ring-2 ring-orange-500 ring-offset-2 ring-offset-brand-bg shadow-[0_0_12px_2px_rgba(249,115,22,0.7)]' },
}
