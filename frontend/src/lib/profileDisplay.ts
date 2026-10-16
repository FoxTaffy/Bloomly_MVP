// Pure helpers for rendering a user profile (no component state).

/** Lighten (positive) or darken (negative) a #rrggbb hex color by a percent, for gradients/glows. */
export function shadeColor(hex: string, percent: number): string {
  const clean = (hex || '#4C67CF').replace('#', '')
  const num = parseInt(clean.length === 6 ? clean : '4C67CF', 16)
  const amt = Math.round(2.55 * percent)
  const r = Math.min(255, Math.max(0, (num >> 16) + amt))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amt))
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amt))
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)
}

// ── Website: add protocol if missing so it doesn't resolve as a relative link ──
export function websiteHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

// ── Fursona species emoji map ────────────────────────────────────────────────
export function speciesEmoji(species: string): string {
  const s = (species ?? '').toLowerCase().trim()
  if (/fox|лис/.test(s))                      return '🦊'
  if (/wolf|волк/.test(s))                     return '🐺'
  if (/cat|кот|кошк/.test(s))                  return '🐱'
  if (/dragon|дракон/.test(s))                 return '🐲'
  if (/raccoon|енот/.test(s))                  return '🦝'
  if (/bear|медведь/.test(s))                  return '🐻'
  if (/panda|панда/.test(s))                   return '🐼'
  if (/rabbit|bunny|кролик|зайц/.test(s))     return '🐰'
  if (/deer|олень/.test(s))                    return '🦌'
  if (/dog|пёс|собак/.test(s))                 return '🐕'
  if (/otter|выдр/.test(s))                    return '🦦'
  if (/bird|птиц|raven|ворон/.test(s))         return '🦅'
  if (/snake|змей|змея/.test(s))               return '🐍'
  if (/bat|летучая/.test(s))                   return '🦇'
  if (/skunk|скунс/.test(s))                   return '🦨'
  if (/lion|лев/.test(s))                      return '🦁'
  if (/tiger|тигр/.test(s))                    return '🐯'
  if (/shark|акул/.test(s))                    return '🦈'
  if (/horse|лошадь|конь|пони/.test(s))        return '🐴'
  if (/frog|лягушк/.test(s))                   return '🐸'
  if (/hyena|гиена/.test(s))                   return '🐾'
  if (/cheetah|gepard|гепард/.test(s))         return '🐆'
  if (/leopard|леопард/.test(s))               return '🐆'
  if (/snow.*leopard|снежный/.test(s))         return '🐆'
  if (/lynx|рысь/.test(s))                     return '🐈'
  if (/ferret|хорек/.test(s))                  return '🐾'
  if (/mink|норк/.test(s))                     return '🦦'
  if (/rat|mouse|мышь|крыс/.test(s))           return '🐭'
  if (/squirrel|белк/.test(s))                 return '🐿️'
  if (/bovine|cow|бык|корова/.test(s))          return '🐄'
  if (/goat|коз/.test(s))                      return '🐐'
  return '🐾'
}

/** Full profile URL for a social network handle (or the URL itself when one was entered). */
export function socialUrl(key: string, val: string) {
  if (key === 'other') return val.startsWith('http') ? val : 'https://' + val
  if (val.startsWith('http')) return val
  // Discord хранит ник, а не ссылку: ссылки на профиль по нику нет
  if (key === 'discord') return ''
  const map: Record<string, string> = { telegram: 'https://t.me/', twitter: 'https://x.com/', instagram: 'https://instagram.com/', youtube: 'https://youtube.com/@', twitch: 'https://twitch.tv/', furaffinity: 'https://www.furaffinity.net/user/', vk: 'https://vk.com/', discord: '', github: 'https://github.com/' }
  // Users may type the handle with or without a leading "@" — normalize so the
  // built URL never ends up with none or a doubled "@" (e.g. youtube.com/@@handle).
  const handle = val.replace(/^@+/, '')
  return (map[key] ?? '') + handle
}

export function isImage(url: string) {
  return /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
}
