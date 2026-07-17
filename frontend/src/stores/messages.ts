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
  badge_type?: string | null
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
  my_participant: { archived: boolean; hidden_at: string | null; last_read_at: string | null; role: string; label?: string; personal_pinned_message_id?: string | null }
  pinned_message: PinnedMessage | null
  last_message: Message | null
  /** Real total member count — `other_participants` is capped server-side to a handful for avatar rendering. */
  participants_count?: number
  other_participants: Array<{ user_id: string; user: MsgSender; last_read_at?: string | null; role?: string }>
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
  const unreadCount      = ref(0)
  const loading          = ref(false)
  const messagesLoading  = ref(false)
  const hasMoreMessages  = ref<Record<string, boolean>>({})

  // Typing: convId → list of user IDs currently typing
  const typingUsers = ref<Record<string, string[]>>({})
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>()

  // Read receipts: convId → partner's last_read_at (ISO)
  const partnerLastRead = ref<Record<string, string | null>>({})

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
        conversations.value.sort(
          (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        )
      } else {
        fetchConversations()
      }

      if (activeId.value !== convId) unreadCount.value++
      if (!isOwn) {
        playNotificationSound()
        // Only pop a toast for conversations the user isn't currently looking at
        if (activeId.value !== convId) {
          const preview = msg.text
            ? msg.text
            : msg.type === 'sticker' ? '🎭 Стикер'
            : msg.type === 'voice' || msg.type === 'audio' ? '🎤 Голосовое сообщение'
            : msg.file_url ? '📎 Медиафайл'
            : '...'
          useNotifToast().addMessageToast({
            senderName: msg.sender.display_name || msg.sender.username,
            senderAvatar: msg.sender.avatar_url,
            senderUsername: msg.sender.username,
            text: preview,
            convId,
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
      // Only store if this is the partner's receipt (not ours)
      const auth = useAuthStore()
      if (userId !== auth.user?.id) {
        partnerLastRead.value[conversationId] = last_read_at
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
      conversations.value = res.data.data.conversations ?? []
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
      unreadCount.value = res.data.data.count ?? 0
    } catch { /* silent */ }
  }

  async function openConversation(targetUserId: string): Promise<string> {
    const res = await api.post('/messages/conversations', { userId: targetUserId })
    const raw = res.data.data.conversation
    const auth = useAuthStore()
    const myId = auth.user?.id
    // Map raw Prisma data → proper Conversation shape (other_participants, my_participant, etc.)
    const conv: Conversation = {
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
    const idx = conversations.value.findIndex((c) => c.id === conv.id)
    if (idx === -1) conversations.value.unshift(conv)
    activeId.value = conv.id
    return conv.id
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

  async function sendMessage(convId: string, content: string, fileUrl?: string | null, mediaType?: string, replyToId?: string | null) {
    const auth = useAuthStore()
    // Optimistic message
    const tempId = `tmp_${Date.now()}`
    const temp: Message = {
      id: tempId,
      conversation_id: convId,
      sender_id: auth.user?.id ?? '',
      text: content || null,
      type: mediaType === 'sticker' ? 'sticker' : fileUrl ? (mediaType ?? 'image') : 'text',
      file_url: fileUrl ?? null,
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
      })
      const msg = res.data?.data?.message as Message | undefined
      const list = messages.value[convId]
      if (list && msg) {
        const idx = list.findIndex((m) => m.id === tempId)
        if (idx !== -1) list.splice(idx, 1, { ...msg, _sending: false })
        else if (!list.some((m) => m.id === msg.id)) list.push(msg)
      }
    } catch {
      const list = messages.value[convId]
      const idx = list?.findIndex((m) => m.id === tempId) ?? -1
      if (list && idx !== -1) list.splice(idx, 1, { ...list[idx], _sending: false, _failed: true })
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
      await fetchUnreadCount()
    } catch { /* silent */ }
  }

  async function setArchived(convId: string, archived: boolean) {
    await api.patch(`/messages/conversations/${convId}/archive`, { archived })
    const conv = conversations.value.find((c) => c.id === convId)
    if (conv?.my_participant) conv.my_participant.archived = archived
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

  // ── Community (group) conversation ─────────────────────────────────────
  async function initGroupChat(groupId: string): Promise<{ conversation: Conversation; alreadyExists: boolean }> {
    const res = await api.post(`/groups/${groupId}/init-chat`)
    return res.data.data as { conversation: Conversation; alreadyExists: boolean }
  }

  async function getGroupChatInfo(groupId: string): Promise<Conversation | null> {
    const res = await api.get(`/groups/${groupId}/chat-info`)
    return (res.data.data?.conversation ?? null) as Conversation | null
  }

  async function openGroupConversation(groupId: string): Promise<string | null> {
    const chatInfo = await getGroupChatInfo(groupId)
    if (!chatInfo) return null
    const convId = chatInfo.id
    // Ensure full conversation data (with participants) is in the list
    const existing = conversations.value.find(c => c.id === convId)
    if (!existing || !existing.other_participants) {
      // Reload all – this returns full participant data from the server
      await fetchConversations()
    }
    activeId.value = convId
    return convId
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
    loading,
    messagesLoading,
    hasMoreMessages,
    typingUsers,
    partnerLastRead,
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
    payRequest,
    deleteMessage,
    editMessage,
    toggleReaction,
    markRead,
    setArchived,
    deleteConversation,
    closeConversation,
    createGroup,
    updateGroup,
    getGroupMembers,
    addGroupMember,
    removeGroupMember,
    setGroupMemberRole,
    initGroupChat,
    getGroupChatInfo,
    openGroupConversation,
    pinMessage,
    unpinMessage,
    getMediaStats,
    forwardMessage,
  }
})
