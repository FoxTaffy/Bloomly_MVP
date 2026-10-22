import { ref } from 'vue'
import { useLangStore } from '@/stores/lang'
import { isDenNotification, denNotificationKey } from '@/lib/denNotifications'

export interface NotifToast {
  id: string
  sourceId?: string
  type: string
  senderName: string
  senderAvatar: string | null
  senderUsername: string
  message: string
  postId?: string
  convId?: string
  /** Set when this is a member's message in their community/DM thread with a group. */
  isGroupDm?: boolean
  groupSlug?: string
  meta?: any
  createdAt: Date
}

const toasts = ref<NotifToast[]>([])
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>()
let counter = 0
const MAX_TOASTS = 4

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

/** Localized label for friend-request notifications (keys live in the translations dict, all 8 languages). */
function friendLabel(type: string): string | null {
  const key = type.toUpperCase()
  if (key !== 'FRIEND_REQUEST' && key !== 'FRIEND_ACCEPT') return null
  const t = useLangStore().t as any
  return key === 'FRIEND_REQUEST' ? t.notifFriendRequest ?? null : t.notifFriendAccept ?? null
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
  return t[`${base}${suffix}`] ?? null
}

export function useNotifToast() {
  function addToast(notif: any) {
    const sourceId = notif?.id ? String(notif.id) : null
    if (sourceId && toasts.value.some(t => t.sourceId === sourceId)) return

    const id = String(++counter)
    const sender = notif.sender ?? {}
    // Actions taken "as" a group (group posts, group comments) mask the real sender.
    const senderGroup = notif.senderGroup ?? null
    const isWarn = notif.type === 'automod_warn'
    const t: NotifToast = {
      id,
      sourceId: sourceId ?? undefined,
      type: notif.type ?? '',
      senderName: isWarn ? 'Bloomly' : (senderGroup?.name || sender.display_name || sender.username || 'Кто-то'),
      senderAvatar: senderGroup?.avatar_url ?? sender.avatar_url ?? null,
      senderUsername: sender.username ?? '',
      message: isWarn
        ? `⚠️ Предупреждение ${notif.meta?.count ?? '?'} из ${notif.meta?.limit ?? 5}`
        : (subscriptionPostLabel(notif.type, sender.pronouns)
          ?? friendLabel(notif.type)
          ?? typeLabel[String(notif.type).toUpperCase()]
          // Dealers' Den: текст описывает действие («принял(а) вашу заявку…»), а не общее «отправил(а) уведомление»
          ?? (isDenNotification(String(notif.type)) ? (useLangStore().t as any)[denNotificationKey(String(notif.type))] : undefined)
          // Unknown type: neutral sentence in the UI language, never the raw type code.
          ?? (useLangStore().t as any).notifGeneric),
      postId: notif.post_id ?? undefined,
      meta: notif.meta,
      createdAt: new Date(),
    }
    toasts.value = [t, ...toasts.value].slice(0, MAX_TOASTS)

    const timer = setTimeout(() => remove(id), 5000)
    toastTimers.set(id, timer)
  }

  /** New chat message — shown with the actual message preview instead of a generic label. */
  function addMessageToast(opts: { senderName: string; senderAvatar: string | null; senderUsername: string; text: string; convId: string; isGroupDm?: boolean; groupSlug?: string }) {
    const dedupeKey = `${opts.convId}:${opts.senderUsername}:${opts.text}`
    if (toasts.value.some(t => t.sourceId === dedupeKey)) return
    // Серия сообщений в одном чате — один тост с последним сообщением, а не стопка из нескольких
    for (const prev of toasts.value.filter(t => t.convId === opts.convId)) remove(prev.id)

    const id = String(++counter)
    const t: NotifToast = {
      id,
      sourceId: dedupeKey,
      type: opts.isGroupDm ? 'GROUP_DM' : 'MESSAGE',
      senderName: opts.senderName,
      senderAvatar: opts.senderAvatar,
      senderUsername: opts.senderUsername,
      message: opts.text,
      convId: opts.convId,
      isGroupDm: opts.isGroupDm,
      groupSlug: opts.groupSlug,
      createdAt: new Date(),
    }
    toasts.value = [t, ...toasts.value].slice(0, MAX_TOASTS)

    const timer = setTimeout(() => remove(id), 5000)
    toastTimers.set(id, timer)
  }

  function remove(id: string) {
    const timer = toastTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      toastTimers.delete(id)
    }
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts, addToast, addMessageToast, remove }
}
