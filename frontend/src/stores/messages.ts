import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import { wsClient } from '@/lib/wsClient'
import { useAuthStore } from '@/stores/auth'
import { useNotifToast } from '@/composables/useNotifToast'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface MsgSender {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  banner_url?: string | null
  badge_type?: string | null
  deceased_at?: string | null
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  text: string | null
  encrypted_text?: string | null
  type: string
  file_url: string | null
  reply_to_id?: string | null
  reply_to?: { id: string; text: string | null; type: string; file_url: string | null; sender: { id: string; username: string; display_name: string | null } } | null
  reactions?: Record<string, string[]> | null
  metadata?: Record<string, any> | null
  edited_at?: string | null
  created_at: string
  deleted_at: string | null
  forwarded_from_id?: string | null
  forwarded_from_sender_id?: string | null
  forwarded_from_conv_id?: string | null
  forwarded_from_sender?: MsgSender | null
  sender: MsgSender
  _sending?: boolean
  _failed?: boolean
  _failReason?: string
}

export interface PinnedMessage {
  id: string
  text: string | null
  type: string
  file_url: string | null
  created_at: string
  sender: { id: string; username: string; display_name: string | null }
}

export interface Conversation {
  id: string
  created_at: string
  updated_at: string
  type: 'direct' | 'group' | 'community'
  group_id: string | null
  is_group: boolean
  name: string | null
  avatar_url: string | null
  banner_url: string | null
  my_participant: {
    archived: boolean; hidden_at: string | null; last_read_at: string | null; role: string; label?: string
    personal_pinned_message_id?: string | null; muted_until?: string | null; sound_muted?: boolean
  }
  pinned_message: PinnedMessage | null
  last_message: Message | null
  /** Real total member count — `other_participants` is capped server-side to a handful for avatar rendering. */
  participants_count?: number
  /** Number of unread messages in this conversation (server-computed). */
  unread_count?: number
  /** Set only for type='community' — the regular member whose personal thread with the group this is. */
  group_dm_user_id?: string | null
  other_participants: Array<{ user_id: string; user: MsgSender; last_read_at?: string | null; role?: string }>
}

export interface GroupInboxThread {
  id: string
  customer: MsgSender
  last_message: { id: string; text: string | null; type: string; sender_id: string; created_at: string } | null
  updated_at: string
  needs_reply: boolean
}

// ── Notification sound ───────────────────────────────────────────────────────
const NOTIFICATION_SOUND_URL = '/sounds/Jiff.mp3'
let notificationAudio: HTMLAudioElement | null = null

function playNotificationSound() {
  try {
    if (!notificationAudio) notificationAudio = new Audio(NOTIFICATION_SOUND_URL)
    notificationAudio.currentTime = 0
    notificationAudio.volume = 0.5
    void notificationAudio.play().catch(() => { /* blocked until user interacts with the page */ })
  } catch { /* unsupported environment */ }
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useMessagesStore = defineStore('messages', () => {
  const conversations    = ref<Conversation[]>([])
  const activeId         = ref<string | null>(null)
  const messages         = ref<Record<string, Message[]>>({})
  // "ЛС" — personal DMs + a member's own community/group-DM thread (Conversation.is_group === false).
  const unreadCount      = ref(0)
  // "Групповой чат" — real multi-participant group conversations (Conversation.is_group === true).
  const groupUnreadCount = ref(0)
  const loading          = ref(false)
  const messagesLoading  = ref(false)
  const hasMoreMessages  = ref<Record<string, boolean>>({})

  // Typing: convId → list of user IDs currently typing
  const typingUsers = ref<Record<string, string[]>>({})
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // Read receipts: convId → partner's last_read_at (ISO)
  const partnerLastRead = ref<Record<string, string | null>>({})

  // ── Client-side "slow down" spam nag (Discord-style) ────────────────────────
  // Purely a UX nudge — the real enforcement (warn/freeze) happens server-side
  // in automod, this just stops someone from firing off a wall of messages
  // before that catches up. Tracked across all conversations, not per-chat.
  const SPAM_NAG_THRESHOLD  = 40
  const SPAM_NAG_WINDOW_MS  = 60_000
  const SPAM_NAG_COOLDOWN_MS = 15_000
  const _sendTimestamps: number[] = []
  const spamNagActive = ref(false)
  const spamNagCooldownUntil = ref(0)

  /** Call before every user-initiated send. Returns true if the send should be blocked. */
  function checkSpamGate(): boolean {
    const now = Date.now()
    if (now < spamNagCooldownUntil.value) {
      spamNagActive.value = true
      return true
    }
    while (_sendTimestamps.length && now - _sendTimestamps[0] > SPAM_NAG_WINDOW_MS) _sendTimestamps.shift()
    _sendTimestamps.push(now)
    if (_sendTimestamps.length >= SPAM_NAG_THRESHOLD) {
      spamNagActive.value = true
      spamNagCooldownUntil.value = now + SPAM_NAG_COOLDOWN_MS
      _sendTimestamps.length = 0
      return true
    }
    return false
  }

  function dismissSpamNag() {
    spamNagActive.value = false
  }

  let unsubWs: (() => void) | null = null
  let unsubTyping: (() => void) | null = null
  let unsubReadReceipt: (() => void) | null = null
  let unsubMessageUpdated: (() => void) | null = null
  let unsubMessageDeleted: (() => void) | null = null

  // ── WebSocket ───────────────────────────────────────────────────────────
  function startListening() {
    if (unsubWs) return
    wsClient.connect()

    unsubWs = wsClient.on('new_message', (frame) => {
      const msg = (frame as any).data as Message
      if (!msg?.conversation_id) return
      const convId = msg.conversation_id
      const auth = useAuthStore()
      const isOwn = msg.sender_id === auth.user?.id
      // Set only on messages inside a group's community/DM thread; customerId tells us whether
      // *we* are that member (our own thread) or group staff watching it via the shared inbox.
      const groupDm = (frame as any).groupDm as
        | { groupId: string; groupSlug: string; groupName: string | null; groupAvatarUrl: string | null; customerId: string }
        | null
      const isStaffSide = !!groupDm && groupDm.customerId !== auth.user?.id

      // Replace matching optimistic temp message, or just append
      if (messages.value[convId]) {
        const tempIdx = messages.value[convId].findIndex(
          (m) => m._sending && m.sender_id === auth.user?.id && m.text === msg.text,
        )
        if (tempIdx !== -1) {
          messages.value[convId].splice(tempIdx, 1, { ...msg, _sending: false })
        } else {
          const exists = messages.value[convId].some((m) => m.id === msg.id)
          if (!exists) messages.value[convId].push(msg)
        }
      }

      // Update last_message + re-sort conversations
      const conv = conversations.value.find((c) => c.id === convId)
      if (conv) {
        conv.last_message = msg
        conv.updated_at = msg.created_at
        if (msg.sender_id !== auth.user?.id && activeId.value !== convId) {
          conv.unread_count = (conv.unread_count ?? 0) + 1
        }
        conversations.value.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
      } else if (!isStaffSide) {
        // Staff watching a member's group thread aren't a participant of it, so refetching
        // the regular conversation list would never surface it anyway — skip the wasted call.
        fetchConversations()
      }

      // Own messages (e.g. sent from another device/tab) must never bump the badge —
      // only count real incoming messages from someone else. Staff-side "Обращения" traffic
      // has its own groupInboxCounts badge (see below) and must not also pollute the
      // ЛС/групповой-чат sidebar counters, which are for the staff member's own conversations.
      if (!isOwn && !isStaffSide && activeId.value !== convId) {
        if (conv) {
          if (conv.is_group) groupUnreadCount.value++
          else unreadCount.value++
        } else {
          // Brand-new conversation we don't have locally yet — resync the real split from
          // the server instead of guessing which bucket it belongs to.
          fetchUnreadCount()
        }
      }
      // Group staff: a member just wrote (or the thread got a new reply) — refresh the
      // "Обращения" badge count for that group so tabs/buttons stay in sync live.
      if (!isOwn && isStaffSide && groupDm) fetchGroupInboxCount(groupDm.groupId)
      if (!isOwn) {
        if (!isConvSoundMuted(conv)) playNotificationSound()
        // Only pop a toast for conversations the user isn't currently looking at, and
        // never for a fully muted one (sound-only mute still shows the toast).
        if (activeId.value !== convId && !isConvMuted(conv)) {
          const preview = msg.text
            ? msg.text
            : msg.type === 'sticker' ? '🎭 Стикер'
            : msg.type === 'voice' ? '🎤 Голосовое сообщение'
            : msg.type === 'audio' ? '🎵 Аудио'
            : msg.type === 'album' ? '📎 Альбом'
            : msg.file_url ? '📎 Медиафайл'
            : '...'
          useNotifToast().addMessageToast({
            senderName: isStaffSide ? (groupDm!.groupName || msg.sender.display_name || msg.sender.username) : (msg.sender.display_name || msg.sender.username),
            senderAvatar: isStaffSide ? (groupDm!.groupAvatarUrl ?? msg.sender.avatar_url) : msg.sender.avatar_url,
            senderUsername: msg.sender.username,
            text: preview,
            convId,
            isGroupDm: isStaffSide,
            groupSlug: isStaffSide ? groupDm!.groupSlug : undefined,
          })
        }
      }
    })

    unsubTyping = wsClient.on('typing', (frame) => {
      const { conversationId, userId } = frame as { conversationId?: string; userId?: string }
      if (!conversationId || !userId) return
      if (!typingUsers.value[conversationId]) typingUsers.value[conversationId] = []
      if (!typingUsers.value[conversationId].includes(userId)) {
        typingUsers.value[conversationId] = [...typingUsers.value[conversationId], userId]
      }
      const key = `${conversationId}:${userId}`
      if (typingTimers.has(key)) clearTimeout(typingTimers.get(key)!)
      typingTimers.set(key, setTimeout(() => {
        typingUsers.value[conversationId] = (typingUsers.value[conversationId] ?? []).filter((id) => id !== userId)
        typingTimers.delete(key)
      }, 3500))
    })

    unsubMessageUpdated = wsClient.on('message_updated', (frame) => {
      const msg = (frame as any).data as Message
      if (!msg?.conversation_id || !msg?.id) return
      const list = messages.value[msg.conversation_id]
      if (!list) return
      const idx = list.findIndex((m) => m.id === msg.id)
      if (idx === -1) return
      // Preserve _sending flag (shouldn't be set on persisted msg, but be safe)
      list.splice(idx, 1, { ...list[idx], ...msg, _sending: false })
    })

    unsubMessageDeleted = wsClient.on('message_deleted', (frame) => {
      const { id, conversation_id } = (frame as any).data as { id?: string; conversation_id?: string }
      if (!id || !conversation_id) return
      const list = messages.value[conversation_id]
      if (list) messages.value[conversation_id] = list.filter((m) => m.id !== id)
      const conv = conversations.value.find((c) => c.id === conversation_id)
      if (conv?.last_message?.id === id) {
        const remaining = messages.value[conversation_id]
        conv.last_message = remaining?.length ? remaining[remaining.length - 1] : null
      }
    })

    unsubReadReceipt = wsClient.on('read_receipt', (frame) => {
      const { conversationId, userId, last_read_at } = frame as {
        conversationId?: string; userId?: string; last_read_at?: string
      }
      if (!conversationId || !userId || !last_read_at) return
      const conv = conversations.value.find((c) => c.id === conversationId)
      if (!conv) return
      const auth = useAuthStore()
      if (userId !== auth.user?.id) {
        // Partner's receipt — used to render the "read" checkmark on our own messages.
        partnerLastRead.value[conversationId] = last_read_at
      } else if (conv.my_participant) {
        // Our own read receipt, echoed back (e.g. read on another device/tab) — keeps
        // the conversation list's unread dot/bold state in sync without a full refetch.
        conv.my_participant.last_read_at = last_read_at
        conv.unread_count = 0
      }
    })
  }

  function stopListening() {
    unsubWs?.()
    unsubTyping?.()
    unsubReadReceipt?.()
    unsubMessageUpdated?.()
    unsubMessageDeleted?.()
    unsubWs = null
    unsubTyping = null
    unsubReadReceipt = null
    unsubMessageUpdated = null
    unsubMessageDeleted = null
  }

  // ── REST API ────────────────────────────────────────────────────────────
  async function fetchConversations() {
    loading.value = true
    try {
      const res = await api.get('/messages/conversations')
      const fresh: Conversation[] = res.data.data.conversations ?? []
      // Preserve a conversation opened via openConversationById() that legitimately isn't
      // in this list — e.g. group staff peeking at a member's thread from the inbox: staff
      // aren't a ConversationParticipant, so it never appears in their own /conversations,
      // but it shouldn't vanish out from under them mid-view because of this refetch.
      const activeExtra = activeId.value && !fresh.some((c) => c.id === activeId.value)
        ? conversations.value.find((c) => c.id === activeId.value)
        : undefined
      conversations.value = activeExtra ? [activeExtra, ...fresh] : fresh
      // Seed partnerLastRead from loaded conversations
      for (const conv of conversations.value) {
        const partner = conv.other_participants?.[0]
        if (partner?.last_read_at !== undefined) {
          partnerLastRead.value[conv.id] = partner.last_read_at ?? null
        }
      }
    } finally {
      loading.value = false
    }
  }

  async function fetchUnreadCount() {
    try {
      const res = await api.get('/messages/conversations/unread')
      unreadCount.value = res.data.data.personal ?? 0
      groupUnreadCount.value = res.data.data.group ?? 0
    } catch { /* silent */ }
  }

  // Map raw Prisma data → proper Conversation shape (other_participants, my_participant, etc.)
  function toConversation(raw: any): Conversation {
    const auth = useAuthStore()
    const myId = auth.user?.id
    return {
      ...raw,
      my_participant: (() => {
        const me = (raw.participants ?? []).find((p: any) => p.user_id === myId)
        return me
          ? { archived: me.archived ?? false, hidden_at: me.hidden_at ?? null, last_read_at: me.last_read_at ?? null, role: me.role ?? 'member', label: me.label ?? 'default', personal_pinned_message_id: me.personal_pinned_message_id ?? null }
          : { archived: false, hidden_at: null, last_read_at: null, role: 'member', label: 'default', personal_pinned_message_id: null }
      })(),
      other_participants: (raw.participants ?? [])
        .filter((p: any) => p.user_id !== myId)
        .map((p: any) => ({ user_id: p.user_id, user: p.user, last_read_at: p.last_read_at ?? null })),
      last_message: raw.last_message ?? null,
      pinned_message: raw.pinned_message ?? null,
    }
  }

  function upsertAndActivate(conv: Conversation): string {
    const idx = conversations.value.findIndex((c) => c.id === conv.id)
    if (idx === -1) conversations.value.unshift(conv)
    activeId.value = conv.id
    return conv.id
  }

  async function openConversation(targetUserId: string): Promise<string> {
    const res = await api.post('/messages/conversations', { userId: targetUserId })
    return upsertAndActivate(toConversation(res.data.data.conversation))
  }

  async function selectConversation(convId: string) {
    activeId.value = convId
    if (!messages.value[convId]) {
      await fetchMessages(convId)
    }
    await markRead(convId)
  }

  async function fetchMessages(convId: string, before?: string) {
    messagesLoading.value = true
    try {
      const params: Record<string, unknown> = { limit: 40 }
      if (before) params.before = before
      const res = await api.get(`/messages/conversations/${convId}/messages`, { params })
      const fetched: Message[] = (res.data.data.messages ?? []).reverse()
      if (!before) {
        messages.value[convId] = fetched
      } else {
        messages.value[convId] = [...fetched, ...(messages.value[convId] ?? [])]
      }
      hasMoreMessages.value[convId] = fetched.length === 40
    } finally {
      messagesLoading.value = false
    }
  }

  async function loadMoreMessages(convId: string) {
    const list = messages.value[convId]
    if (!list?.length || !hasMoreMessages.value[convId]) return
    const oldest = list[0].created_at
    await fetchMessages(convId, oldest)
  }

  async function sendMessage(
    convId: string,
    content: string,
    fileUrl?: string | null,
    mediaType?: string,
    replyToId?: string | null,
    attachments?: Array<{ url: string; media_type?: string }>,
  ) {
    const auth = useAuthStore()
    const isAlbum = !!attachments && attachments.length > 1
    // Optimistic message
    const tempId = `tmp_${Date.now()}`
    const temp: Message = {
      id: tempId,
      conversation_id: convId,
      sender_id: auth.user?.id ?? '',
      text: content || null,
      type: isAlbum ? 'album' : mediaType === 'sticker' ? 'sticker' : fileUrl ? (mediaType ?? 'image') : 'text',
      file_url: fileUrl ?? null,
      metadata: isAlbum ? { files: attachments!.map((a) => ({ url: a.url, type: a.media_type ?? 'image' })) } : null,
      reply_to_id: replyToId ?? null,
      created_at: new Date().toISOString(),
      deleted_at: null,
      sender: {
        id: auth.user?.id ?? '',
        username: (auth.user as any)?.username ?? '',
        display_name: (auth.user as any)?.display_name ?? null,
        avatar_url: auth.avatarUrl ?? null,
      },
      _sending: true,
    }
    if (messages.value[convId]) messages.value[convId].push(temp)

    // Persist over REST — the WS 'message' frame silently no-ops when the socket
    // isn't OPEN (reconnecting, backgrounded tab, etc.), which used to leave the
    // optimistic bubble stuck on "sending" forever with nothing ever saved server-side.
    try {
      const res = await api.post(`/messages/conversations/${convId}/messages`, {
        content: content ?? '',
        file_url: fileUrl ?? undefined,
        media_type: mediaType ?? undefined,
        reply_to_id: replyToId ?? undefined,
        attachments: attachments ?? undefined,
      })
      const msg = res.data?.data?.message as Message | undefined
      const list = messages.value[convId]
      if (list && msg) {
        const idx = list.findIndex((m) => m.id === tempId)
        if (idx !== -1) list.splice(idx, 1, { ...msg, _sending: false })
        else if (!list.some((m) => m.id === msg.id)) list.push(msg)
      }
    } catch (err: any) {
      const list = messages.value[convId]
      const idx = list?.findIndex((m) => m.id === tempId) ?? -1
      const reason = err?.response?.data?.error?.message as string | undefined
      if (list && idx !== -1) list.splice(idx, 1, { ...list[idx], _sending: false, _failed: true, _failReason: reason })
    }
  }

  /** Chat-only order card — not wired to Dealers' Den, purely a rich message type. */
  async function sendPaymentRequest(convId: string, payload: { amount: number; description: string; prepaymentPercent?: number; deadline?: string }) {
    const res = await api.post(`/messages/conversations/${convId}/messages`, { type: 'payment_request', metadata: payload })
    const msg = res.data?.data?.message as Message | undefined
    if (msg && messages.value[convId] && !messages.value[convId].some((m) => m.id === msg.id)) {
      messages.value[convId].push(msg)
    }
    return msg
  }

  async function sendTip(convId: string, amount: number, note?: string) {
    const res = await api.post(`/messages/conversations/${convId}/messages`, { type: 'tip', metadata: { amount, note } })
    const msg = res.data?.data?.message as Message | undefined
    if (msg && messages.value[convId] && !messages.value[convId].some((m) => m.id === msg.id)) {
      messages.value[convId].push(msg)
    }
    return msg
  }

  /** Shares a post into a chat as a rich card message. */
  async function sendPostShare(convId: string, postId: string) {
    const res = await api.post(`/messages/conversations/${convId}/messages`, { type: 'post_share', metadata: { postId } })
    const msg = res.data?.data?.message as Message | undefined
    if (msg && messages.value[convId] && !messages.value[convId].some((m) => m.id === msg.id)) {
      messages.value[convId].push(msg)
    }
    return msg
  }

  /** Invites someone to a group by sharing it into a DM as a rich card message. */
  async function sendGroupShare(convId: string, groupId: string) {
    const res = await api.post(`/messages/conversations/${convId}/messages`, { type: 'group_share', metadata: { groupId } })
    const msg = res.data?.data?.message as Message | undefined
    if (msg && messages.value[convId] && !messages.value[convId].some((m) => m.id === msg.id)) {
      messages.value[convId].push(msg)
    }
    return msg
  }

  /** Marks a payment_request as paid and appends the payment_confirmation card the server creates. */
  async function payRequest(msgId: string) {
    const res = await api.post(`/messages/messages/${msgId}/pay`)
    const { request, confirmation } = (res.data?.data ?? {}) as { request?: Message; confirmation?: Message }
    if (request) {
      const list = messages.value[request.conversation_id]
      const idx = list?.findIndex((m) => m.id === request.id) ?? -1
      if (list && idx !== -1) list.splice(idx, 1, { ...list[idx], ...request })
    }
    if (confirmation) {
      const list = messages.value[confirmation.conversation_id]
      if (list && !list.some((m) => m.id === confirmation.id)) list.push(confirmation)
    }
    return { request, confirmation }
  }

  async function deleteMessage(msgId: string) {
    await api.delete(`/messages/messages/${msgId}`)
    for (const convId of Object.keys(messages.value)) {
      messages.value[convId] = messages.value[convId].filter((m) => m.id !== msgId)
    }
  }

  async function editMessage(msgId: string, text: string) {
    const res = await api.patch(`/messages/messages/${msgId}`, { text })
    const updated = res.data?.data?.message as Message | undefined
    if (!updated) return
    // Optimistic local update; WS broadcast will arrive shortly with same data
    const list = messages.value[updated.conversation_id]
    if (!list) return
    const idx = list.findIndex((m) => m.id === updated.id)
    if (idx !== -1) list.splice(idx, 1, { ...list[idx], ...updated, _sending: false })
  }

  async function toggleReaction(msgId: string, emoji: string) {
    // Optimistic update — find the message and toggle locally
    const auth = useAuthStore()
    const myId = auth.user?.id
    if (!myId) return
    let convIdFound: string | null = null
    for (const convId of Object.keys(messages.value)) {
      const list = messages.value[convId]
      const idx = list.findIndex((m) => m.id === msgId)
      if (idx === -1) continue
      convIdFound = convId
      const msg = { ...list[idx] }
      const reactions: Record<string, string[]> = { ...(msg.reactions ?? {}) }
      const list2 = reactions[emoji] ? [...reactions[emoji]] : []
      const i = list2.indexOf(myId)
      if (i === -1) list2.push(myId); else list2.splice(i, 1)
      if (list2.length) reactions[emoji] = list2; else delete reactions[emoji]
      msg.reactions = Object.keys(reactions).length ? reactions : null
      list.splice(idx, 1, msg)
      break
    }
    try {
      await api.post(`/messages/messages/${msgId}/reactions`, { emoji })
    } catch {
      // Revert by refetching the conversation slice if needed
      if (convIdFound) await fetchMessages(convIdFound)
    }
  }

  async function markRead(convId: string) {
    try {
      await api.post(`/messages/conversations/${convId}/read`)
      // Optimistic — don't wait for the read_receipt WS round-trip to clear the
      // conversation list's unread dot/bold state for the conversation just read.
      const conv = conversations.value.find((c) => c.id === convId)
      if (conv?.my_participant) conv.my_participant.last_read_at = new Date().toISOString()
      if (conv) conv.unread_count = 0
      await fetchUnreadCount()
    } catch { /* silent */ }
  }

  async function setArchived(convId: string, archived: boolean) {
    await api.patch(`/messages/conversations/${convId}/archive`, { archived })
    const conv = conversations.value.find((c) => c.id === convId)
    if (conv?.my_participant) conv.my_participant.archived = archived
  }

  /** `mutedUntil: null` unmutes. `soundMuted` silences sound only, independent of the full mute. */
  async function setMute(convId: string, opts: { mutedUntil?: string | null; soundMuted?: boolean }) {
    await api.patch(`/messages/conversations/${convId}/mute`, { muted_until: opts.mutedUntil, sound_muted: opts.soundMuted })
    const conv = conversations.value.find((c) => c.id === convId)
    if (conv?.my_participant) {
      if (opts.mutedUntil !== undefined) conv.my_participant.muted_until = opts.mutedUntil
      if (opts.soundMuted !== undefined) conv.my_participant.sound_muted = opts.soundMuted
    }
  }

  function isConvMuted(conv: Conversation | undefined): boolean {
    const until = conv?.my_participant?.muted_until
    return !!until && new Date(until) > new Date()
  }
  function isConvSoundMuted(conv: Conversation | undefined): boolean {
    return isConvMuted(conv) || !!conv?.my_participant?.sound_muted
  }

  async function deleteConversation(convId: string, scope: 'me' | 'all') {
    await api.delete(`/messages/conversations/${convId}?scope=${scope}`)
    conversations.value = conversations.value.filter((c) => c.id !== convId)
    delete messages.value[convId]
  }

  // ── Group actions ──────────────────────────────────────────────────────
  async function createGroup(name: string, userIds: string[], opts?: { avatar_url?: string; banner_url?: string }): Promise<string> {
    const res = await api.post('/messages/groups', { name, userIds, ...opts })
    const conv: Conversation = res.data.data.conversation
    conversations.value.unshift(conv as any)
    activeId.value = conv.id
    return conv.id
  }

  async function updateGroup(convId: string, data: { name?: string; avatar_url?: string; banner_url?: string }) {
    await api.patch(`/messages/conversations/${convId}/group`, data)
    const conv = conversations.value.find((c) => c.id === convId)
    if (conv) {
      if (data.name !== undefined) conv.name = data.name
      if (data.avatar_url !== undefined) conv.avatar_url = data.avatar_url
      if (data.banner_url !== undefined) (conv as any).banner_url = data.banner_url
    }
  }

  async function getGroupMembers(convId: string) {
    const res = await api.get(`/messages/conversations/${convId}/members`)
    return res.data.data.members as Array<{ user_id: string; role: string; user: MsgSender }>
  }

  async function addGroupMember(convId: string, userId: string) {
    await api.post(`/messages/conversations/${convId}/members`, { userId })
  }

  async function removeGroupMember(convId: string, userId: string) {
    await api.delete(`/messages/conversations/${convId}/members/${userId}`)
  }

  async function setGroupMemberRole(convId: string, userId: string, role: 'admin' | 'member') {
    await api.patch(`/messages/conversations/${convId}/members/${userId}/role`, { role })
  }

  // ── Group DM ("написать сообществу") ─────────────────────────────────────
  // Find-or-create my personal thread with a group, then make it the active conversation.
  async function startGroupDm(groupId: string): Promise<string | null> {
    const res = await api.post(`/groups/${groupId}/dm`)
    const raw = res.data.data?.conversation
    if (!raw) return null
    return upsertAndActivate(toConversation(raw))
  }

  async function getGroupInbox(groupId: string): Promise<GroupInboxThread[]> {
    const res = await api.get(`/groups/${groupId}/inbox`)
    return (res.data.data?.threads ?? []) as GroupInboxThread[]
  }

  // groupId → number of "Обращения" threads currently waiting on a staff reply. Powers the
  // badges on GroupDetailView's "Обращения" button, the inbox tab in GroupAdminToolsView,
  // the aggregate badge on the sidebar's "Группы" item, and per-card badges on the groups grid.
  const groupInboxCounts = ref<Record<string, number>>({})
  async function fetchGroupInboxCount(groupId: string): Promise<number> {
    try {
      const threads = await getGroupInbox(groupId)
      const n = threads.filter(t => t.needs_reply).length
      groupInboxCounts.value[groupId] = n
      return n
    } catch {
      return groupInboxCounts.value[groupId] ?? 0
    }
  }

  /** Bulk variant of fetchGroupInboxCount — one request for every group the caller owns/admins/moderates. */
  async function fetchMyGroupInboxCounts(): Promise<void> {
    try {
      const res = await api.get('/messages/groups/inbox-counts')
      const counts = (res.data.data?.counts ?? []) as { groupId: string; count: number }[]
      for (const { groupId, count } of counts) groupInboxCounts.value[groupId] = count
    } catch { /* silent */ }
  }

  // Open a conversation the caller isn't necessarily a participant of (e.g. group staff
  // opening a member's thread from the inbox) — fetches it standalone and activates it.
  async function openConversationById(convId: string): Promise<void> {
    const res = await api.get(`/messages/conversations/${convId}`)
    const conversation = res.data.data?.conversation as Conversation | undefined
    if (conversation) {
      const idx = conversations.value.findIndex(c => c.id === conversation.id)
      if (idx === -1) conversations.value.unshift(conversation)
      else conversations.value[idx] = conversation
    }
    activeId.value = convId
  }

  // ── Pin / Unpin message ─────────────────────────────────────
  async function pinMessage(convId: string, messageId: string, scope: 'all' | 'me') {
    await api.put(`/messages/conversations/${convId}/pin`, { messageId, scope })
    const msg = messages.value[convId]?.find(m => m.id === messageId)
    if (!msg) return
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    const pinObj: PinnedMessage = {
      id: msg.id, text: msg.text, type: msg.type, file_url: msg.file_url,
      created_at: msg.created_at,
      sender: { id: msg.sender.id, username: msg.sender.username, display_name: msg.sender.display_name },
    }
    if (scope === 'all') {
      conv.pinned_message = pinObj
    } else {
      if (conv.my_participant) conv.my_participant.personal_pinned_message_id = messageId
    }
  }

  async function unpinMessage(convId: string, scope: 'all' | 'me') {
    await api.delete(`/messages/conversations/${convId}/pin`, { params: { scope } })
    const conv = conversations.value.find(c => c.id === convId)
    if (!conv) return
    if (scope === 'all') {
      conv.pinned_message = null
    } else {
      if (conv.my_participant) conv.my_participant.personal_pinned_message_id = null
    }
  }

  async function getMediaStats(convId: string): Promise<Record<string, number>> {
    try {
      const res = await api.get(`/messages/conversations/${convId}/media-stats`)
      return res.data.data.stats as Record<string, number>
    } catch {
      return {}
    }
  }

  /** Paginated messages of one media type, for the media-browser sub-view (Фото/Видео/Аудио/Голос/Ссылки). */
  async function getMediaMessages(convId: string, type: string, before?: string): Promise<Message[]> {
    try {
      const res = await api.get(`/messages/conversations/${convId}/media`, { params: { type, before } })
      return (res.data?.data?.messages ?? []) as Message[]
    } catch {
      return []
    }
  }

  function closeConversation() {
    activeId.value = null
  }

  async function forwardMessage(msgId: string, targetConvId: string): Promise<void> {
    const res = await api.post(`/messages/messages/${msgId}/forward`, { targetConversationId: targetConvId })
    const msg: Message = res.data.data?.message
    if (msg && messages.value[targetConvId]) {
      messages.value[targetConvId].push(msg)
    }
  }

  /** Remove a message from local state only (used to clear a failed send before retrying). */
  function removeLocalMessage(convId: string, msgId: string) {
    const list = messages.value[convId]
    if (list) messages.value[convId] = list.filter((m) => m.id !== msgId)
  }

  return {
    conversations,
    activeId,
    messages,
    unreadCount,
    groupUnreadCount,
    loading,
    messagesLoading,
    hasMoreMessages,
    typingUsers,
    partnerLastRead,
    spamNagActive,
    spamNagCooldownUntil,
    checkSpamGate,
    dismissSpamNag,
    startListening,
    stopListening,
    fetchConversations,
    fetchUnreadCount,
    openConversation,
    selectConversation,
    fetchMessages,
    loadMoreMessages,
    sendMessage,
    removeLocalMessage,
    sendPaymentRequest,
    sendTip,
    sendPostShare,
    sendGroupShare,
    payRequest,
    deleteMessage,
    editMessage,
    toggleReaction,
    markRead,
    setArchived,
    setMute,
    isConvMuted,
    isConvSoundMuted,
    deleteConversation,
    closeConversation,
    createGroup,
    updateGroup,
    getGroupMembers,
    addGroupMember,
    removeGroupMember,
    setGroupMemberRole,
    startGroupDm,
    getGroupInbox,
    groupInboxCounts,
    fetchGroupInboxCount,
    fetchMyGroupInboxCounts,
    openConversationById,
    pinMessage,
    unpinMessage,
    getMediaStats,
    getMediaMessages,
    forwardMessage,
  }
})
