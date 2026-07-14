import { ref } from 'vue'

export interface NotifToast {
  id: string
  type: string
  senderName: string
  senderAvatar: string | null
  senderUsername: string
  message: string
  postId?: string
  convId?: string
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
  GROUP_POST:           'опубликовал(а) в сообществе',
  GROUP_EVENT:          'новое событие в сообществе',
  GROUP_JOIN:           'вступил(а) в ваше сообщество',
}

export function useNotifToast() {
  function addToast(notif: any) {
    const id = String(++counter)
    const sender = notif.sender ?? {}
    const t: NotifToast = {
      id,
      type: notif.type ?? '',
      senderName: sender.display_name || sender.username || 'Кто-то',
      senderAvatar: sender.avatar_url ?? null,
      senderUsername: sender.username ?? '',
      message: typeLabel[String(notif.type).toUpperCase()] ?? notif.type ?? '',
      postId: notif.post_id ?? undefined,
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
