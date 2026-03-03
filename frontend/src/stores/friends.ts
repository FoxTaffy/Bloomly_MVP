import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface FriendUser {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  banner_url: string | null
  badge_type: string | null
  location: string | null
  birth_date: string | null
}

export interface FriendRequest {
  id: string
  status: string
  createdAt: string
  user: FriendUser
}

export interface Friend extends FriendUser {
  online: boolean
}

export interface FriendBirthday extends Friend {
  daysUntil: number
  nextBirthday: string
}

export interface FriendStatus {
  status: 'none' | 'pending' | 'accepted'
  friendshipId?: string
  isSentByMe?: boolean
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useFriendsStore = defineStore('friends', () => {
  const friends        = ref<Friend[]>([])
  const followers      = ref<FriendUser[]>([])
  const following      = ref<FriendUser[]>([])
  const requests       = ref<FriendRequest[]>([])
  const outgoing       = ref<FriendRequest[]>([])
  const suggestions    = ref<FriendUser[]>([])
  const birthdays      = ref<FriendBirthday[]>([])
  const isLoading      = ref(false)
  const requestsCount  = ref(0)

  // ── Actions ──────────────────────────────────────────────────────────────

  async function loadFriends(filter?: 'online') {
    isLoading.value = true
    try {
      const { data } = await api.get<{ success: boolean; data: Friend[] }>(
        '/friends',
        { params: filter ? { filter } : {} }
      )
      friends.value = data.data
    } finally {
      isLoading.value = false
    }
  }

  async function loadFollowers() {
    const { data } = await api.get<{ success: boolean; data: FriendUser[] }>('/friends/followers')
    followers.value = data.data
  }

  async function loadFollowing() {
    const { data } = await api.get<{ success: boolean; data: FriendUser[] }>('/friends/following')
    following.value = data.data
  }

  async function loadRequests() {
    const { data } = await api.get<{ success: boolean; data: FriendRequest[] }>('/friends/requests')
    requests.value = data.data
    requestsCount.value = data.data.length
  }

  async function loadOutgoing() {
    const { data } = await api.get<{ success: boolean; data: FriendRequest[] }>('/friends/requests/outgoing')
    outgoing.value = data.data
  }

  async function loadSuggestions() {
    const { data } = await api.get<{ success: boolean; data: FriendUser[] }>('/friends/suggestions')
    suggestions.value = data.data
  }

  async function loadBirthdays() {
    const { data } = await api.get<{ success: boolean; data: FriendBirthday[] }>('/friends/birthdays')
    birthdays.value = data.data
  }

  async function sendRequest(targetId: string) {
    await api.post('/friends/request', { targetId })
    await loadSuggestions()
    await loadOutgoing()
  }

  async function acceptRequest(id: string) {
    await api.post(`/friends/requests/${id}/accept`)
    requests.value = requests.value.filter((r) => r.id !== id)
    requestsCount.value = requests.value.length
    await loadFriends()
  }

  async function rejectRequest(id: string) {
    await api.post(`/friends/requests/${id}/reject`)
    requests.value = requests.value.filter((r) => r.id !== id)
    requestsCount.value = requests.value.length
  }

  async function removeFriend(friendId: string) {
    await api.delete(`/friends/${friendId}`)
    friends.value = friends.value.filter((f) => f.id !== friendId)
  }

  async function getFriendStatus(userId: string): Promise<FriendStatus> {
    const { data } = await api.get<{ success: boolean; data: FriendStatus }>(`/friends/${userId}/status`)
    return data.data
  }

  return {
    friends,
    followers,
    following,
    requests,
    outgoing,
    suggestions,
    birthdays,
    isLoading,
    requestsCount,
    loadFriends,
    loadFollowers,
    loadFollowing,
    loadRequests,
    loadOutgoing,
    loadSuggestions,
    loadBirthdays,
    sendRequest,
    acceptRequest,
    rejectRequest,
    removeFriend,
    getFriendStatus,
  }
})

