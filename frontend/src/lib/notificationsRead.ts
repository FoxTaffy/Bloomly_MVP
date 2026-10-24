// Шапка, боковое меню и страница «Уведомления» держат счётчик непрочитанных каждая у себя.
// Когда уведомления помечены прочитанными в одном месте, остальные узнают об этом из этого события
// и перечитывают счётчик с сервера — иначе бейдж в шапке не гаснет до перезагрузки страницы.
const EVENT = 'bloomly:notifications-read'

/** ids — какие уведомления помечены; null — все. Вызывать после успешного POST /notifications/read. */
export function announceNotificationsRead(ids: string[] | null = null) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { ids } }))
}

/** Подписка на событие; возвращает функцию отписки. */
export function onNotificationsRead(handler: (ids: string[] | null) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<{ ids: string[] | null }>).detail?.ids ?? null)
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}
