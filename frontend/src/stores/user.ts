import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  banner_url: string | null
  status: string | null
  persona: string | null
  likes: string[]
  dislikes: string[]
  accent_color: string | null
  created_at: string
}

export interface UpdateProfileInput {
  display_name?: string
  bio?: string
  avatar_url?: string
  banner_url?: string
  status?: string
  persona?: string
  likes?: string[]
  dislikes?: string[]
  accent_color?: string
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useUserStore = defineStore('user', () => {
  // ── State ─────────────────────────────────────────────────────────────────
  const profile   = ref<UserProfile | null>(null)
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Fetch any user's public profile by id. Returns the profile or null. */
  async function fetchProfile(id: string): Promise<UserProfile | null> {
    isLoading.value = true
    error.value = null
    try {
      const res  = await fetch(`/api/users/${id}`)
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Failed to load profile')
      }
      return data.data.user as UserProfile
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Connection error'
      return null
    } finally {
      isLoading.value = false
    }
  }

  /** Fetch and store the currently authenticated user's own profile. */
  async function fetchMyProfile(): Promise<void> {
    const auth = useAuthStore()
    if (!auth.user?.id) return
    const result = await fetchProfile(auth.user.id)
    if (result) profile.value = result
  }

  /** Send PATCH /api/users/me and update the stored profile. */
  async function updateProfile(input: UpdateProfileInput): Promise<void> {
    const auth = useAuthStore()
    isLoading.value = true
    error.value = null
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Update failed')
      }
      profile.value = data.data.user as UserProfile
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  return {
    profile,
    isLoading,
    error,
    fetchProfile,
    fetchMyProfile,
    updateProfile,
  }
})
