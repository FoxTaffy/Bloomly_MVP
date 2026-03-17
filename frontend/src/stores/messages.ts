import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import { wsClient } from '@/lib/wsClient'
import { useAuthStore } from '@/stores/auth'

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
  type: string
  file_url: string | null
  reply_to_id?: string | null
  reply_to?: { id: string; text: string | null; type: string; file_url: string | null; sender: { id: string; username: string; display_name: string | null } } | null
  created_at: string
  deleted_at: string | null
  sender: MsgSender
  _sending?: boolean   // optimistic flag
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
  other_participants: Array<{ user_id: string; user: MsgSender; last_read_at?: string | null; role?: string }>
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

  // ── WebSocket ───────────────────────────────────────────────────────────
  function startListening() {
    if (unsubWs) return
    wsClient.connect()

    unsubWs = wsClient.on('new_message', (frame) => {
      const msg = (frame as any).data as Message
      if (!msg?.conversation_id) return
      const convId = msg.conversation_id

      // Replace matching optimistic temp message, or just append
      if (messages.value[convId]) {
        const auth = useAuthStore()
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
    unsubWs = null
    unsubTyping = null
    unsubReadReceipt = null
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
    const conv: Conversation = res.data.data.conversation
    const idx = conversations.value.findIndex((c) => c.id === conv.id)
    if (idx === -1) conversations.value.unshift(conv as any)
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

  function sendMessage(convId: string, content: string, fileUrl?: string | null, mediaType?: string, replyToId?: string | null) {
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
    wsClient.send({ type: 'message', conversationId: convId, content: content ?? '', file_url: fileUrl ?? undefined, media_type: mediaType ?? undefined, reply_to_id: replyToId ?? undefined })
  }

  async function deleteMessage(msgId: string) {
    await api.delete(`/messages/messages/${msgId}`)
    for (const convId of Object.keys(messages.value)) {
      messages.value[convId] = messages.value[convId].filter((m) => m.id !== msgId)
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
    deleteMessage,
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
  }
})
