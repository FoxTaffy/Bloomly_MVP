/** Reads a File as a raw base64 data URL, unscaled. */
export function readRawDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target!.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * Reads an image File as a base64 data URL, downscaled so its longest side is
 * at most `maxDim`. Phone camera photos can be 10-50MP; feeding that straight
 * into an interactive cropper makes the initial decode and every drag/zoom
 * redraw block the main thread for minutes on lower-end devices.
 */
export function readScaledDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no 2d context')); return }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('toBlob failed')); return }
        readRawDataUrl(new File([blob], file.name, { type: 'image/jpeg' })).then(resolve, reject)
      }, 'image/jpeg', 0.9)
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('image decode failed')) }
    img.src = objectUrl
  })
}

/**
 * Downscales + re-encodes an image file before upload, so a huge phone-camera
 * photo (tens of MB, tens of megapixels) doesn't get rejected by the reverse
 * proxy's body-size cap before the backend even gets to resize it. The
 * backend already shrinks avatars/banners down to 500x500 / 1500x500, so
 * capping the upload at maxDim keeps plenty of detail without blur while
 * cutting the payload from ~100MB+ down to a couple MB. Animated GIFs are
 * passed through untouched so avatar animation keeps working.
 */
export function compressImageForUpload(file: File, maxDim = 2000, quality = 0.9): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return Promise.resolve(file)
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      // Already small enough in both dimensions and bytes — upload as-is.
      if (scale === 1 && file.size <= 8 * 1024 * 1024) { resolve(file); return }
      const w = Math.max(1, Math.round(img.width * scale))
      const h = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => {
        if (!blob) { resolve(file); return }
        resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file) }
    img.src = objectUrl
  })
}

/**
 * Маскирует email, оставляя первые 2 символа локальной части и домен видимыми:
 * "thefoxlaffytaffy@gmail.com" → "th*************@gmail.com"
 */
export function maskEmail(email?: string | null): string {
  if (!email) return ''
  const at = email.indexOf('@')
  if (at <= 0) return email
  const local = email.slice(0, at)
  const domain = email.slice(at)
  const visible = local.slice(0, Math.min(2, local.length))
  return visible + '*'.repeat(Math.max(local.length - visible.length, 0)) + domain
}

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

/** Радужная рамка (флаг LGBT): шесть концентрических колец толщиной w px. */
export function rainbowShadow(w = 1): string {
  return ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787']
    .map((c, i) => `0 0 0 ${(i + 1) * w}px ${c}`).join(',')
}

export const PROFILE_FRAMES: Record<string, { label: string; style: string }> = {
  none: { label: 'Нет', style: '' },
  default_ring: { label: 'Кольцо', style: 'ring-2 ring-brand-accent ring-offset-2 ring-offset-brand-bg' },
  gold: { label: 'Золото', style: 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-brand-bg' },
  neon: { label: 'Неон', style: 'ring-2 ring-pink-500 ring-offset-2 ring-offset-brand-bg shadow-[0_0_12px_2px_rgba(236,72,153,0.7)]' },
  rainbow: { label: 'Радуга', style: '' },
  silver: { label: 'Серебро', style: 'ring-2 ring-slate-300 ring-offset-2 ring-offset-brand-bg' },
  fire: { label: 'Огонь', style: 'ring-2 ring-orange-500 ring-offset-2 ring-offset-brand-bg shadow-[0_0_12px_2px_rgba(249,115,22,0.7)]' },
}
