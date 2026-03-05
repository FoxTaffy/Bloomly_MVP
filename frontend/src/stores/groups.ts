import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

// ── Types ──────────────────────────────────────────────────────────────────────
export type GroupType = 'event' | 'creative' | 'static' | 'news' | 'shop' | 'community' | 'brand'
export type EventStatus = 'announced' | 'tickets_open' | 'sold_out' | 'active' | 'finished' | 'teaser'

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
  created_at: string
  owner: GroupOwner
  _count: { members: number; events: number; posts: number }
  events?: EventItem[]
  commissionInfo?: CommissionInfo | null
  achievements?: GroupAchievement[]
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
  starts_at: string
  ends_at: string
  status: EventStatus
  is_recurring: boolean
  theme: Record<string, any>
  attendee_count: number
  is_top: boolean
  schedule: { time: string; label: string }[] | null
  what_to_bring: string[] | null
  rules_text: string | null
  faq: { q: string; a: string }[] | null
  created_at: string
  _count: { tickets: number; soonBadges: number }
  tickets?: TicketTier[]
  soonBadges?: SoonBadgeUser[]
  group?: {
    id: string; slug: string; name: string; type: string
    avatar_url: string | null; accent_color: string | null
  }
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
    group: { id: string; slug: string; name: string; avatar_url: string | null }
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

export interface GroupAchievement {
  id: string
  title: string
  icon: string
  color: string | null
  earned_at: string
}

export interface GroupMembership {
  group_id: string
  user_id: string
  role: string
  joined_at: string
  group: Group
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useGroupsStore = defineStore('groups', () => {
  const groups = ref<Group[]>([])
  const currentGroup = ref<Group | null>(null)
  const myGroups = ref<GroupMembership[]>([])
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
    } finally {
      isLoading.value = false
    }
  }

  async function loadMyGroups() {
    const { data } = await api.get('/groups/me')
    myGroups.value = data.data.memberships
  }

  async function createGroup(input: {
    name: string; slug: string; type: GroupType; description?: string
    avatarUrl?: string; bannerUrl?: string; accentColor?: string; isPublic?: boolean
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
    await api.post(`/groups/${id}/join`)
    await loadMyGroups()
  }

  async function leaveGroup(id: string) {
    await api.post(`/groups/${id}/leave`)
    myGroups.value = myGroups.value.filter(m => m.group_id !== id)
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

  // ── Rating ────────────────────────────────────────────────────────────────

  async function rateGroup(groupId: string, value: number) {
    const { data } = await api.post(`/groups/${groupId}/rate`, { value })
    if (currentGroup.value) {
      currentGroup.value.rating = data.data.rating
      currentGroup.value.rating_count = data.data.ratingCount
    }
    return data.data
  }

  async function getMyRating(groupId: string) {
    const { data } = await api.get(`/groups/${groupId}/my-rating`)
    return data.data.myRating as number
  }

  // ── Group Posts ───────────────────────────────────────────────────────────

  async function loadGroupPosts(groupId: string, page = 1, limit = 20) {
    const { data } = await api.get(`/groups/${groupId}/posts`, { params: { page, limit } })
    return data.data.posts
  }

  async function createGroupPost(groupId: string, input: { content: string; isNsfw?: boolean; mediaUrls?: string[]; tags?: string[] }) {
    const { data } = await api.post(`/groups/${groupId}/posts`, input)
    return data.data.post
  }

  return {
    groups, currentGroup, myGroups, events, currentEvent, mySoonBadges,
    isLoading, total,
    eventGroups, creativeGroups, staticGroups, newsGroups, shopGroups, communityGroups, brandGroups,
    loadGroups, loadGroup, loadMyGroups, createGroup, updateGroup, deleteGroup,
    joinGroup, leaveGroup,
    loadEvents, loadEvent, createEvent, updateEvent,
    toggleSoonBadge, toggleSoonBadgeVisibility, loadMySoonBadges,
    updateCommission,
    rateGroup, getMyRating,
    loadGroupPosts, createGroupPost,
  }
})
