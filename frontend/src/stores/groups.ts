import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import api from '../api'
import { useAuthStore } from './auth'

// ── Types ──────────────────────────────────────────────────────────────────────
export type GroupType = 'event' | 'creative' | 'static' | 'news' | 'shop' | 'community' | 'brand'
export type EventStatus = 'announced' | 'tickets_open' | 'sold_out' | 'active' | 'finished' | 'teaser'

export type MemberRole = 'owner' | 'admin' | 'moderator' | 'member' | 'dealer' | 'volunteer' | 'guest_of_honor'

/** Owner or admin of a group: may manage it and post on its behalf. */
export const isGroupManagerRole = (role: string) => role === 'owner' || role === 'admin'

export interface GroupMember {
  group_id: string
  user_id: string
  role: string
  joined_at: string
  user: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
  }
}

export interface GroupOwner {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
}

export interface Group {
  id: string
  slug: string
  name: string
  description: string | null
  type: GroupType
  owner_id: string
  avatar_url: string | null
  banner_url: string | null
  accent_color: string | null
  mascot_url: string | null
  social_links: Record<string, string>
  is_public: boolean
  is_nsfw: boolean
  rules_text: string | null
  faq: { q: string; a: string }[] | null
  contact_phone: string | null
  contact_email: string | null
  about_text: string | null
  schedule: { time: string; label: string }[] | null
  what_to_bring: string[] | null
  rating: number
  rating_count: number
  subscriber_count: number
  members_count: number
  badge_level?: string
  production_time: string | null
  delivery_info: string | null
  completed_works: number
  recent_works: any[] | null
  guarantee_text: string | null
  sponsors: { name: string; logo_url?: string; url?: string; tier?: string }[]
  volunteers_info: string | null
  is_looking_for_volunteers: boolean
  is_verified: boolean
  category: string | null
  rubric: string | null
  event_date: string | null
  event_expired_at: string | null
  group_bg_url: string | null
  group_frame: string | null
  group_theme: string | null
  hide_admins: boolean
  hidden_member_ids: string
  business_enabled: boolean
  created_at: string
  owner: GroupOwner
  _count: { members: number; events: number; posts: number }
  events?: EventItem[]
  commissionInfo?: CommissionInfo | null
  donations_enabled?: boolean
  support_tiers?: SupportTier[]
}

/** Owner-configured support tier shown in the group sidebar (Group.support_tiers JSON). */
export interface SupportTier {
  emoji?: string
  name: string
  price: string | number
  desc?: string
}

export interface EventItem {
  id: string
  group_id: string
  title: string
  short_code: string
  description: string | null
  banner_url: string | null
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  // not returned by the backend today; the UI guards on them
  location_address?: string | null
  map_embed_url?: string | null
  starts_at: string
  ends_at: string
  status: EventStatus
  is_recurring: boolean
  theme: Record<string, any>
  attendee_count: number
  is_top: boolean
  registration_url: string | null
  schedule: { time: string; label: string }[] | null
  what_to_bring: string[] | null
  rules_text: string | null
  faq: { q: string; a: string }[] | null
  created_at: string
  subEvents?: SubEvent[]
  _count: { tickets: number; soonBadges: number }
  tickets?: TicketTier[]
  soonBadges?: SoonBadgeUser[]
  group?: {
    id: string; slug: string; name: string; type: string
    avatar_url: string | null; banner_url: string | null; accent_color: string | null
    event_date?: string | null; event_expired_at?: string | null
  }
}

export interface SubEvent {
  id: string
  event_id: string
  title: string
  type: string
  speaker: string | null
  location_name: string | null
  starts_at: string
  ends_at: string
  description: string | null
  created_at: string
}

export interface TicketTier {
  id: string
  name: string
  price: string
  currency: string
  total_count: number
  sold_count: number
  sale_starts_at: string | null
  sale_ends_at: string | null
  description: string | null
  perks: string[]
}

export type RsvpStatus = 'going' | 'maybe' | 'not_going'

export interface EventAttendee {
  id: string
  event_id: string
  user_id: string
  status: RsvpStatus
  confirmed_at: string
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}

export interface SoonBadge {
  id: string
  user_id: string
  event_id: string
  show_badge: boolean
  event: {
    id: string; title: string; short_code: string
    starts_at: string; ends_at: string; status: EventStatus
    banner_url: string | null
    location_name: string | null
    attendee_count: number
    group: { id: string; slug: string; name: string; avatar_url: string | null; banner_url: string | null }
  }
}

export interface SoonBadgeUser {
  id: string
  user_id: string
  show_badge: boolean
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}

export interface CommissionInfo {
  id: string
  status: 'open' | 'closed' | 'waitlist'
  base_prices: Record<string, number>
  currency: string
  tos_text: string | null
  queue_count: number
  max_queue: number
  rush_slots: number
  rush_max: number
  turnaround_days: string | null
  price_list: { name: string; price: number; description: string }[] | null
}

export interface GroupMembership {
  group_id: string
  user_id: string
  role: string
  joined_at: string
  is_pinned: boolean
  notify_posts: boolean
  group: Group
}

export interface GroupMessage {
  id: string
  group_id: string
  user_id: string
  text: string
  created_at: string
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}

export type TodoStatus = 'WAITING' | 'SKETCH' | 'LINEART' | 'COLORING' | 'FINISHED'

// Todo item status is a free key referencing a TodoColumn.key (custom columns) or
// one of the default TodoStatus values — kept as `string` since groups can rename/replace columns.
export interface ArtistQueueItem {
  id: string
  group_id: string
  title: string
  description: string | null
  status: string
  position: number
  created_at: string
  updated_at: string
}

export interface TodoColumn {
  key: string
  label: string
  icon: string
  color: string
}

// ── Orders (Business tab) ───────────────────────────────────────────────────
export type OrderStatus = TodoStatus

export interface Order {
  id: string
  group_id: string
  customer_id: string
  title: string
  description: string | null
  form_data: Record<string, unknown> | null
  status: OrderStatus
  position: number
  deadline_at: string | null
  conversation_id: string | null
  created_at: string
  updated_at: string
  customer: { id: string; username: string; display_name: string | null; avatar_url: string | null }
}

export interface BusinessStats {
  postsCount: number
  messagesCount: number
  ordersByStatus: Record<OrderStatus, number>
}

// ── Group balance (donations) ───────────────────────────────────────────────
export interface GroupTransaction {
  id: string
  group_id: string
  user_id: string | null
  type: 'DONATION' | 'ADJUSTMENT'
  amount: string
  message: string | null
  created_at: string
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null } | null
}

export type GroupPermission =
  | 'can_post'
  | 'can_comment'
  | 'can_invite'
  | 'can_moderate_posts'
  | 'can_manage_members'
  | 'can_manage_events'
  | 'can_manage_roles'
  | 'can_manage_settings'

export interface CustomRole {
  id: string
  group_id: string
  name: string
  color: string
  icon: string
  permissions: GroupPermission[]
  position: number
  created_at: string
  updated_at: string
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useGroupsStore = defineStore('groups', () => {
  const groups = ref<Group[]>([])
  const currentGroup = ref<Group | null>(null)
  const myGroups = ref<GroupMembership[]>([])
  /** Groups I own or administer. */
  const managedGroups = computed(() => myGroups.value.filter(m => isGroupManagerRole(m.role)).map(m => m.group))
  /** Whether I own or administer the given group. */
  const managesGroup = (groupId: string | null | undefined) =>
    !!groupId && myGroups.value.some(m => m.group_id === groupId && isGroupManagerRole(m.role))
  const mySubscriptions = ref<string[]>([]) // group ids the user is subscribed to (notification-only)
  const events = ref<EventItem[]>([])
  const currentEvent = ref<EventItem | null>(null)
  const mySoonBadges = ref<SoonBadge[]>([])
  const isLoading = ref(false)
  const total = ref(0)

  // ── Computed ─────────────────────────────────────────────────────────────
  const eventGroups = computed(() => groups.value.filter(g => g.type === 'event'))
  const creativeGroups = computed(() => groups.value.filter(g => g.type === 'creative'))
  const staticGroups = computed(() => groups.value.filter(g => g.type === 'static'))
  const newsGroups = computed(() => groups.value.filter(g => g.type === 'news'))
  const shopGroups = computed(() => groups.value.filter(g => g.type === 'shop'))
  const communityGroups = computed(() => groups.value.filter(g => g.type === 'community'))
  const brandGroups = computed(() => groups.value.filter(g => g.type === 'brand'))

  // ── Actions ──────────────────────────────────────────────────────────────

  async function loadGroups(params?: { type?: GroupType; search?: string; page?: number; limit?: number }) {
    isLoading.value = true
    try {
      const { data } = await api.get('/groups', { params })
      groups.value = data.data.groups
      total.value = data.data.total
    } finally {
      isLoading.value = false
    }
  }

  async function loadGroup(slugOrId: string) {
    isLoading.value = true
    try {
      const { data } = await api.get(`/groups/${slugOrId}`)
      currentGroup.value = data.data.group
      return data.data.group
    } catch (e) {
      currentGroup.value = null
      throw e
    } finally {
      isLoading.value = false
    }
  }

  // Владелец группы приходит копией объекта. Когда пользователь меняет свой ник,
  // обновляем эту копию в уже загруженных группах, иначе ник устареет до перезагрузки.
  function applyOwnUsername(userId: string, username: string) {
    const patch = (owner: GroupOwner | undefined) => { if (owner?.id === userId) owner.username = username }
    if (currentGroup.value) patch(currentGroup.value.owner)
    groups.value.forEach(g => patch(g.owner))
    myGroups.value.forEach(m => patch(m.group.owner))
  }

  const authStore = useAuthStore()
  watch(() => authStore.user?.username, (username) => {
    if (authStore.user && username) applyOwnUsername(authStore.user.id, username)
  })

  async function loadMyGroups() {
    const { data } = await api.get('/groups/me')
    myGroups.value = data.data.memberships
  }

  async function createGroup(input: {
    name: string; slug: string; type: GroupType; description?: string
    avatarUrl?: string; bannerUrl?: string; accentColor?: string; isPublic?: boolean
    socialLinks?: Record<string, string>
  }) {
    const { data } = await api.post('/groups', input)
    return data.data.group
  }

  async function updateGroup(id: string, input: Record<string, any>) {
    const { data } = await api.patch(`/groups/${id}`, input)
    currentGroup.value = data.data.group
    return data.data.group
  }

  async function deleteGroup(id: string) {
    await api.delete(`/groups/${id}`)
    groups.value = groups.value.filter(g => g.id !== id)
  }

  async function joinGroup(id: string) {
    const { data } = await api.post(`/groups/${id}/join`)
    // Use returned membership directly — avoid re-fetching all memberships
    const membership = data.data.membership
    if (membership) {
      const idx = myGroups.value.findIndex(m => m.group_id === id)
      if (idx === -1) myGroups.value.unshift(membership)
      else myGroups.value[idx] = membership
    } else {
      await loadMyGroups()
    }
  }

  async function leaveGroup(id: string) {
    await api.post(`/groups/${id}/leave`)
    myGroups.value = myGroups.value.filter(m => m.group_id !== id)
  }

  async function loadMySubscriptions() {
    const { data } = await api.get('/groups/me/subscriptions')
    mySubscriptions.value = data.data.groupIds
  }

  async function subscribeGroup(id: string) {
    await api.post(`/groups/${id}/subscribe`)
    if (!mySubscriptions.value.includes(id)) mySubscriptions.value.push(id)
  }

  async function unsubscribeGroup(id: string) {
    await api.delete(`/groups/${id}/subscribe`)
    mySubscriptions.value = mySubscriptions.value.filter(gid => gid !== id)
  }

  async function togglePinGroup(groupId: string) {
    const { data } = await api.patch(`/groups/${groupId}/pin`)
    const m = myGroups.value.find(m => m.group_id === groupId)
    if (m) m.is_pinned = data.data.is_pinned
    return data.data.is_pinned as boolean
  }

  // ── Events ────────────────────────────────────────────────────────────────

  async function loadEvents(params?: { groupId?: string; status?: string; upcoming?: boolean; page?: number; limit?: number; sort?: string; location?: string }) {
    isLoading.value = true
    try {
      const { data } = await api.get('/groups/events', { params })
      events.value = data.data.events
      return data.data
    } finally {
      isLoading.value = false
    }
  }

  async function loadEvent(eventId: string) {
    isLoading.value = true
    try {
      const { data } = await api.get(`/groups/events/${eventId}`)
      currentEvent.value = data.data.event
      return data.data.event
    } finally {
      isLoading.value = false
    }
  }

  async function createEvent(groupId: string, input: Record<string, any>) {
    const { data } = await api.post(`/groups/${groupId}/events`, input)
    return data.data.event
  }

  async function updateEvent(eventId: string, input: Record<string, any>) {
    const { data } = await api.patch(`/groups/events/${eventId}`, input)
    currentEvent.value = data.data.event
    return data.data.event
  }

  // ── SOON Badge ────────────────────────────────────────────────────────────

  async function toggleSoonBadge(eventId: string) {
    const { data } = await api.post(`/groups/events/${eventId}/soon`)
    return data.data // { added: boolean }
  }

  async function toggleSoonBadgeVisibility(eventId: string) {
    const { data } = await api.patch(`/groups/events/${eventId}/soon/visibility`)
    return data.data.badge
  }

  async function loadMySoonBadges(userId: string) {
    const { data } = await api.get(`/groups/soon/user/${userId}`)
    mySoonBadges.value = data.data.badges
  }

  // ── Commission ────────────────────────────────────────────────────────────

  async function updateCommission(groupId: string, input: Record<string, any>) {
    const { data } = await api.put(`/groups/${groupId}/commission`, input)
    if (currentGroup.value) currentGroup.value.commissionInfo = data.data.commission
    return data.data.commission
  }

  // ── Rating (Reddit-style − / +) ─────────────────────────────────────────────

  async function rateGroup(groupId: string, value: 1 | -1) {
    const { data } = await api.post(`/groups/${groupId}/rate`, { value })
    if (currentGroup.value) {
      currentGroup.value.rating = data.data.score
      currentGroup.value.rating_count = data.data.voteCount
    }
    return data.data as { score: number; voteCount: number; myVote: 1 | -1 | 0 }
  }

  async function getMyRating(groupId: string) {
    const { data } = await api.get(`/groups/${groupId}/my-rating`)
    return data.data.myRating as number
  }

  // ── Group Posts ───────────────────────────────────────────────────────────

  async function loadGroupPosts(groupId: string, page = 1, limit = 20, hasMedia = false) {
    const { data } = await api.get(`/groups/${groupId}/posts`, { params: { page, limit, hasMedia: hasMedia || undefined } })
    return data.data.posts
  }

  async function createGroupPost(groupId: string, input: { content: string; title?: string; postType?: string; isNsfw?: boolean; isAiGenerated?: boolean; isAnnouncement?: boolean; mediaUrls?: string[]; mediaOriginalUrls?: string[]; tags?: string[]; visibility?: string; category?: string }) {
    const { data } = await api.post(`/groups/${groupId}/posts`, input)
    return data.data.post
  }

  async function loadKanban(groupId: string) {
    const { data } = await api.get(`/groups/${groupId}/kanban`)
    return data.data.columns as Record<string, any[]>
  }

  // ── Ticket Tiers ──────────────────────────────────────────────────────────

  async function createTicketTier(eventId: string, input: {
    name: string; price: number; currency?: string; totalCount: number
    saleStartsAt?: string; saleEndsAt?: string
  }) {
    const { data } = await api.post(`/groups/events/${eventId}/tickets`, input)
    return data.data.tier
  }

  async function updateTicketTier(tierId: string, input: {
    name?: string; price?: number; currency?: string; totalCount?: number
    saleStartsAt?: string | null; saleEndsAt?: string | null
  }) {
    const { data } = await api.patch(`/groups/tickets/${tierId}`, input)
    return data.data.tier
  }

  async function deleteTicketTier(tierId: string) {
    await api.delete(`/groups/tickets/${tierId}`)
  }

  // ── RSVP ──────────────────────────────────────────────────────────────────

  async function rsvpEvent(eventId: string, status: RsvpStatus) {
    const { data } = await api.post(`/groups/events/${eventId}/rsvp`, { status })
    return data.data.attendee as EventAttendee
  }

  async function cancelRsvp(eventId: string) {
    await api.delete(`/groups/events/${eventId}/rsvp`)
  }

  async function getEventAttendees(eventId: string, page = 1, limit = 50) {
    const { data } = await api.get(`/groups/events/${eventId}/attendees`, { params: { page, limit } })
    return data.data as { attendees: EventAttendee[]; total: number }
  }

  async function getMyRsvp(eventId: string) {
    const { data } = await api.get(`/groups/events/${eventId}/my-rsvp`)
    return data.data.rsvp as { id: string; status: RsvpStatus } | null
  }
  // ── Sub-events ───────────────────────────────────────────────────────

  async function loadSubEvents(eventId: string) {
    const { data } = await api.get(`/groups/events/${eventId}/subevents`)
    return data.data.subEvents as SubEvent[]
  }

  async function createSubEvent(eventId: string, input: {
    title: string; type?: string; speaker?: string; locationName?: string
    startsAt: string; endsAt: string; description?: string
  }) {
    const { data } = await api.post(`/groups/events/${eventId}/subevents`, input)
    return data.data.subEvent as SubEvent
  }

  async function updateSubEvent(eventId: string, subId: string, input: Record<string, any>) {
    const { data } = await api.patch(`/groups/events/${eventId}/subevents/${subId}`, input)
    return data.data.subEvent as SubEvent
  }

  async function deleteSubEvent(eventId: string, subId: string) {
    await api.delete(`/groups/events/${eventId}/subevents/${subId}`)
  }

  // ── Group Chat Messages ──────────────────────────────────────────────────

  async function loadGroupMessages(groupId: string, before?: string, limit = 50) {
    const { data } = await api.get(`/groups/${groupId}/chat`, { params: { before, limit } })
    return data.data.messages as GroupMessage[]
  }

  async function sendGroupMessageRest(groupId: string, text: string) {
    const { data } = await api.post(`/groups/${groupId}/chat`, { text })
    return data.data.message as GroupMessage
  }
  // ── Discover ──────────────────────────────────────────────────────────────

  async function discoverGroups(page = 1, limit = 20) {
    const { data } = await api.get('/groups/discover', { params: { page, limit } })
    return data.data as { groups: Group[]; total: number }
  }

  // ── Members management ─────────────────────────────────────────────────────

  async function fetchMembers(groupId: string, page = 1, limit = 100): Promise<GroupMember[]> {
    const { data } = await api.get(`/groups/${groupId}/members`, { params: { page, limit } })
    return data.data.members as GroupMember[]
  }

  async function changeMemberRole(groupId: string, userId: string, role: MemberRole): Promise<GroupMember> {
    const { data } = await api.patch(`/groups/${groupId}/members/${userId}/role`, { role })
    return data.data.member as GroupMember
  }

  async function removeMember(groupId: string, userId: string): Promise<void> {
    await api.delete(`/groups/${groupId}/members/${userId}`)
  }

  // ── Artist Queue (Todo) ───────────────────────────────────────────────────

  async function fetchTodoColumns(groupId: string) {
    const { data } = await api.get(`/groups/${groupId}/todo-columns`)
    return data.data.columns as TodoColumn[]
  }

  async function updateTodoColumns(groupId: string, columns: TodoColumn[]) {
    const { data } = await api.put(`/groups/${groupId}/todo-columns`, { columns })
    return data.data.columns as TodoColumn[]
  }

  async function fetchTodoItems(groupId: string) {
    const { data } = await api.get(`/groups/${groupId}/todo`)
    return data.data.items as ArtistQueueItem[]
  }

  async function createTodoItem(groupId: string, payload: { title: string; description?: string; status?: string }) {
    const { data } = await api.post(`/groups/${groupId}/todo`, payload)
    return data.data.item as ArtistQueueItem
  }

  async function updateTodoItem(groupId: string, itemId: string, payload: Partial<{ title: string; description: string; status: string; position: number }>) {
    const { data } = await api.patch(`/groups/${groupId}/todo/${itemId}`, payload)
    return data.data.item as ArtistQueueItem
  }

  async function deleteTodoItem(groupId: string, itemId: string) {
    await api.delete(`/groups/${groupId}/todo/${itemId}`)
  }

  async function reorderTodoItems(groupId: string, orderedIds: string[]) {
    await api.put(`/groups/${groupId}/todo/reorder`, { orderedIds })
  }

  // ── Orders (Business tab) ─────────────────────────────────────────────────

  async function fetchOrders(groupId: string): Promise<Order[]> {
    const { data } = await api.get(`/groups/${groupId}/orders`)
    return data.data.orders as Order[]
  }

  async function createOrder(groupId: string, payload: { title: string; description?: string; formData?: Record<string, unknown>; deadlineAt?: string }): Promise<Order> {
    const { data } = await api.post(`/groups/${groupId}/orders`, payload)
    return data.data.order as Order
  }

  async function updateOrderStatus(groupId: string, orderId: string, status: OrderStatus): Promise<Order> {
    const { data } = await api.patch(`/groups/${groupId}/orders/${orderId}/status`, { status })
    return data.data.order as Order
  }

  async function deleteOrder(groupId: string, orderId: string): Promise<void> {
    await api.delete(`/groups/${groupId}/orders/${orderId}`)
  }

  async function fetchBusinessStats(groupId: string): Promise<BusinessStats> {
    const { data } = await api.get(`/groups/${groupId}/orders-stats`)
    return data.data.stats as BusinessStats
  }

  async function getOrderConversation(groupId: string, orderId: string): Promise<string> {
    const { data } = await api.get(`/groups/${groupId}/orders/${orderId}/conversation`)
    return data.data.conversationId as string
  }

  // ── Group balance (donations) ─────────────────────────────────────────────

  async function donateToGroup(groupId: string, amount: number, message?: string): Promise<{ balance: string; transaction: GroupTransaction }> {
    const { data } = await api.post(`/groups/${groupId}/donate`, { amount, message })
    return data.data
  }

  async function getGroupBalance(groupId: string): Promise<{ balance: string; transactions: GroupTransaction[] }> {
    const { data } = await api.get(`/groups/${groupId}/balance`)
    return data.data
  }

  // ── Custom Roles ────────────────────────────────────────────────────

  async function fetchCustomRoles(groupId: string): Promise<CustomRole[]> {
    const { data } = await api.get(`/groups/${groupId}/roles`)
    return data.data.roles as CustomRole[]
  }

  async function createCustomRole(groupId: string, payload: { name: string; color?: string; icon?: string; permissions?: string[] }): Promise<CustomRole> {
    const { data } = await api.post(`/groups/${groupId}/roles`, payload)
    return data.data.role as CustomRole
  }

  async function updateCustomRole(groupId: string, roleId: string, payload: Partial<{ name: string; color: string; icon: string; permissions: string[] }>): Promise<CustomRole> {
    const { data } = await api.patch(`/groups/${groupId}/roles/${roleId}`, payload)
    return data.data.role as CustomRole
  }

  async function deleteCustomRole(groupId: string, roleId: string): Promise<void> {
    await api.delete(`/groups/${groupId}/roles/${roleId}`)
  }

  // ── Trending ──────────────────────────────────────────────────────────────

  const trendingGroups = ref<Group[]>([])
  const trendingTotal = ref(0)
  const isTrendingLoading = ref(false)

  async function loadTrending(page = 1, limit = 20) {
    isTrendingLoading.value = true
    try {
      const { data } = await api.get('/groups/trending', { params: { page, limit } })
      if (data.success) {
        trendingGroups.value = data.data.groups
        trendingTotal.value = data.data.total
      }
    } finally { isTrendingLoading.value = false }
  }

  // ── Notification toggle ───────────────────────────────────────────────────

  async function toggleGroupNotification(groupId: string) {
    const { data } = await api.patch(`/groups/${groupId}/notify`)
    if (data.success) {
      const m = myGroups.value.find(m => m.group_id === groupId)
      if (m) m.notify_posts = data.data.notify_posts
    }
    return data.data as { notify_posts: boolean }
  }

  return {
    groups, currentGroup, myGroups, managedGroups, managesGroup, mySubscriptions, events, currentEvent, mySoonBadges,
    isLoading, total,
    trendingGroups, trendingTotal, isTrendingLoading,
    eventGroups, creativeGroups, staticGroups, newsGroups, shopGroups, communityGroups, brandGroups,
    loadGroups, loadGroup, loadMyGroups, createGroup, updateGroup, deleteGroup,
    joinGroup, leaveGroup, togglePinGroup,
    loadMySubscriptions, subscribeGroup, unsubscribeGroup,
    loadEvents, loadEvent, createEvent, updateEvent,
    toggleSoonBadge, toggleSoonBadgeVisibility, loadMySoonBadges,
    updateCommission,
    rateGroup, getMyRating,
    loadGroupPosts, createGroupPost, loadKanban,
    createTicketTier, updateTicketTier, deleteTicketTier,
    rsvpEvent, cancelRsvp, getEventAttendees, getMyRsvp,
    discoverGroups, loadTrending, toggleGroupNotification,
    loadSubEvents, createSubEvent, updateSubEvent, deleteSubEvent,
    loadGroupMessages, sendGroupMessageRest,
    fetchMembers, changeMemberRole, removeMember,
    fetchTodoColumns, updateTodoColumns,
    fetchTodoItems, createTodoItem, updateTodoItem, deleteTodoItem, reorderTodoItems,
    fetchOrders, createOrder, updateOrderStatus, deleteOrder, fetchBusinessStats, getOrderConversation,
    donateToGroup, getGroupBalance,
    fetchCustomRoles, createCustomRole, updateCustomRole, deleteCustomRole,
  }
})
