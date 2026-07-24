import { ref } from 'vue'
import { useLangStore } from '@/stores/lang'

export interface NotifToast {
  id: string
  type: string
  senderName: string
  senderAvatar: string | null
  senderUsername: string
  message: string
  postId?: string
  convId?: string
  meta?: any
  createdAt: Date
}

const toasts = ref<NotifToast[]>([])
let counter = 0

const typeLabel: Record<string, string> = {
  LIKE:                 'поставил(а) + вашей публикации',
  COMMENT:              'прокомментировал(а) вашу публикацию',
  REPAW:                'поставил(а) RePaw',
  FOLLOW:               'подписался(ась) на вас',
  MENTION:              'упомянул(а) вас',
  RELATIONSHIP_REQUEST: 'хочет быть вашим партнёром 💕',
  RELATIONSHIP_ACCEPTED:'принял(а) ваш запрос в отношения ❤️',
  GROUP_EVENT:          'новое событие в сообществе',
  GROUP_JOIN:           'вступил(а) в ваше сообщество',
}

/** Localized label for the two gender-aware "new post" notification types. */
function subscriptionPostLabel(type: string, pronouns?: string | null): string | null {
  const key = type.toUpperCase()
  if (key !== 'FOLLOW_POST' && key !== 'GROUP_POST') return null
  const t = useLangStore().t
  const p = (pronouns || '').toLowerCase()
  const isMale = p.startsWith('он')
  const isFemale = p.startsWith('она')
  const base = key === 'FOLLOW_POST' ? 'notifFollowPost' : 'notifGroupPost'
  const suffix = isMale ? 'M' : isFemale ? 'F' : 'N'
  return (t as any)[`${base}${suffix}`] ?? null
}

export function useNotifToast() {
  function addToast(notif: any) {
    const id = String(++counter)
    const sender = notif.sender ?? {}
    const isWarn = notif.type === 'automod_warn'
    const t: NotifToast = {
      id,
      type: notif.type ?? '',
      senderName: isWarn ? 'Bloomly' : (sender.display_name || sender.username || 'Кто-то'),
      senderAvatar: sender.avatar_url ?? null,
      senderUsername: sender.username ?? '',
      message: isWarn
        ? `⚠️ Предупреждение ${notif.meta?.count ?? '?'} из ${notif.meta?.limit ?? 5}`
        : (subscriptionPostLabel(notif.type, sender.pronouns)
          ?? typeLabel[String(notif.type).toUpperCase()]
          ?? notif.type ?? ''),
      postId: notif.post_id ?? undefined,
      meta: notif.meta,
      createdAt: new Date(),
    }
    toasts.value.unshift(t)
    // Auto-remove after 5s
    setTimeout(() => remove(id), 5000)
  }

  /** New chat message — shown with the actual message preview instead of a generic label. */
  function addMessageToast(opts: { senderName: string; senderAvatar: string | null; senderUsername: string; text: string; convId: string }) {
    const id = String(++counter)
    const t: NotifToast = {
      id,
      type: 'MESSAGE',
      senderName: opts.senderName,
      senderAvatar: opts.senderAvatar,
      senderUsername: opts.senderUsername,
      message: opts.text,
      convId: opts.convId,
      createdAt: new Date(),
    }
    toasts.value.unshift(t)
    setTimeout(() => remove(id), 5000)
  }

  function remove(id: string) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts, addToast, addMessageToast, remove }
}
