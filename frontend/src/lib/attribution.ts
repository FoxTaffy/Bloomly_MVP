// Учёт рекламного трафика (Anti-Collision Tracking), сторона браузера.
//
// Рекламная ссылка (/api/t/<код> или обычная ссылка с utm_*) приводит на сайт с метками. Здесь они
// запоминаются на устройстве и после регистрации привязываются к аккаунту:
//  • метки читаются сразу при открытии, до роутера и логина, поэтому их не съедают редиректы внутри приложения;
//  • первое касание хранится отдельно от последнего — если человек успел побывать на двух рекламах,
//    ни одна не затирает другую;
//  • bl_cid (id клика с сервера) надёжнее utm_*: по нему ссылка находится, даже если метки срезали;
//  • привязка выполняется один раз и только после успешного входа, поэтому OAuth и подтверждение почты не теряют источник.
import api from '@/api'
import { apiErrorStatus } from '@/lib/apiError'

const STORAGE_KEY = 'bl_attr'
const FIRST_TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface Touch {
  code?: string
  click_id?: string
  at: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
}

interface Stored {
  visitor_id: string
  first?: Touch
  last?: Touch
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Stored) : null
  } catch {
    return null
  }
}

function write(value: Stored | null) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Приватный режим или переполненное хранилище: учёт тихо отключается, сайт работает как обычно
  }
}

function newVisitorId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
}

function touchFromUrl(search: string): Touch | null {
  const q = new URLSearchParams(search)
  const code = q.get('bl_ref') || undefined
  const click_id = q.get('bl_cid') || undefined
  const utm_source = q.get('utm_source') || undefined
  const utm_campaign = q.get('utm_campaign') || undefined
  if (!code && !click_id && !utm_source && !utm_campaign) return null
  return {
    code, click_id, at: new Date().toISOString(),
    utm_source, utm_campaign,
    utm_medium: q.get('utm_medium') || undefined,
    utm_content: q.get('utm_content') || undefined,
  }
}

/** Вызывается один раз при старте приложения: запоминает метки из адреса и сообщает серверу о визите. */
export function captureAttribution(location: Pick<Location, 'search' | 'pathname'> = window.location): void {
  const touch = touchFromUrl(location.search)
  if (!touch) return

  const stored = read() ?? { visitor_id: newVisitorId() }
  const firstExpired = stored.first && Date.now() - Date.parse(stored.first.at) > FIRST_TOUCH_TTL_MS
  if (!stored.first || firstExpired) stored.first = touch
  stored.last = touch
  write(stored)

  // keepalive: запрос дойдёт, даже если вкладку закроют или перейдут на другую страницу
  try {
    void fetch('/api/track/visit', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitor_id: stored.visitor_id, touch, path: location.pathname }),
    }).catch(() => {})
  } catch {
    // нет fetch — не страшно
  }
}

/** После входа: привязывает аккаунт к рекламе (сервер принимает только свежие аккаунты и только один раз). */
export async function claimAttribution(): Promise<void> {
  const stored = read()
  if (!stored || (!stored.first && !stored.last)) return
  try {
    await api.post('/track/claim', { visitor_id: stored.visitor_id, first: stored.first, last: stored.last })
    // Ответ получен (привязано или аккаунт старый) — метки больше не нужны. При сетевой ошибке оставляем до следующего входа.
    write(null)
  } catch (e) {
    // Отказ сервера (кроме 401/429) повторять бессмысленно; сеть и 5xx — повторим при следующем входе
    const status = apiErrorStatus(e)
    if (status && status >= 400 && status < 500 && status !== 401 && status !== 429) write(null)
  }
}
