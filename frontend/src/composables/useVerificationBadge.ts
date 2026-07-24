const KNOWN_TYPES = new Set([
  'artist', 'master', 'fursuiter', 'popular', 'writer', 'organizer', 'event',
  'photographer', 'programmer',
])

// Per-type badge icons (see backend verification module for the type list).
// PNG files live in frontend/public/icons/badges/<type>.png; falls back to the
// generic "official paw" badge for legacy/unrecognized types.
export function verificationBadgeIcon(verificationType?: string | null): string {
  if (verificationType && KNOWN_TYPES.has(verificationType)) {
    return `/icons/badges/${verificationType}.png`
  }
  return '/icons/badges/paw_offical.png'
}

export const VERIFICATION_TYPE_INFO: Record<string, { label: string; desc: string }> = {
  artist: { label: 'Художник', desc: 'Профессионально рисует и продаёт авторские работы.' },
  master: { label: 'Мастер', desc: 'Изготавливает костюмы, атрибутику и другие изделия на заказ.' },
  fursuiter: { label: 'Фурсьютер', desc: 'Выступает и снимается в собственном фурсьют-костюме.' },
  popular: { label: 'Медийная личность', desc: 'Имеет большую и активную аудиторию в соцсетях.' },
  writer: { label: 'Автор / Писатель', desc: 'Публикует авторские произведения — рассказы, комиксы, статьи.' },
  organizer: { label: 'Организатор', desc: 'Организует мероприятия и ивенты для сообщества.' },
  event: { label: 'Мероприятие', desc: 'Официальный аккаунт мероприятия.' },
  photographer: { label: 'Фотограф', desc: 'Профессионально снимает участников сообщества.' },
  programmer: { label: 'Программист', desc: 'Разрабатывает проекты и инструменты для сообщества.' },
}

export function verificationTypeInfo(verificationType?: string | null) {
  if (verificationType && VERIFICATION_TYPE_INFO[verificationType]) {
    return VERIFICATION_TYPE_INFO[verificationType]
  }
  return { label: 'Верифицирован', desc: 'Аккаунт подтверждён модератором Bloomly.' }
}
