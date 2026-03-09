import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import api from '@/api'

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
  website: string | null
  location: string | null
  pronouns: string | null
  badge_type: string | null
  job_title: string | null
  relationship_status: string | null
  relationship_with: string | null
  country: string | null
  fursona_name: string | null
  fursona_color: string | null
  fursona_gender: string | null
  fursona_description: string | null
  fursona_photo_url: string | null
  has_fursuit: boolean
  fursuit_photo_url: string | null
  fursuit_description: string | null
  fursuit_maker: string | null
  birth_date: string | null
  relationship_since: string | null
  pinned_post_id: string | null
  role: string
  created_at: string
  social_links: Record<string, string> | null
  interests: string[]
  subscription_tier: string
  profile_theme: string | null
  profile_bg_url: string | null
  profile_frame: string | null
  is_verified: boolean
  verified_at: string | null
  verification_type: string | null
  artist_since: string | null
  onboarding_done: boolean
  _count?: { followers: number; following: number; posts: number }
  pinnedPost?: any | null
  badge_level?: string
}

export interface UpdateProfileInput {
  display_name?: string
  bio?: string
  avatar_url?: string
  banner_url?: string
  status?: string
  persona?: string
  fursona_name?: string
  fursona_gender?: string
  fursona_description?: string
  likes?: string[]
  dislikes?: string[]
  accent_color?: string
  website?: string
  location?: string
  pronouns?: string
  job_title?: string
  relationship_status?: string
  relationship_with?: string | null
  country?: string
  fursona_color?: string
  fursona_photo_url?: string
  has_fursuit?: boolean
  fursuit_photo_url?: string | null
  fursuit_description?: string | null
  fursuit_maker?: string | null
  birth_date?: string | null
  relationship_since?: string | null
  social_links?: Record<string, string> | null
  interests?: string[]
  subscription_tier?: string
  profile_theme?: string | null
  profile_bg_url?: string | null
  profile_frame?: string | null
  artist_since?: string | null
  onboarding_done?: boolean
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
      const res = await api.get(`/users/${id}`)
      if (!res.data.success) throw new Error(res.data.error?.message ?? 'Failed to load profile')
      return res.data.data.user as UserProfile
    } catch (e: any) {
      error.value = e.response?.data?.error?.message ?? (e instanceof Error ? e.message : 'Connection error')
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
      const res = await api.patch('/users/me', input)
      if (!res.data.success) throw new Error(res.data.error?.message ?? 'Update failed')
      profile.value = res.data.data.user as UserProfile
      // Sync key fields back to auth store so sidebar / AppHeader update immediately
      const updated = res.data.data.user as UserProfile
      if (auth.user) {
        if (updated.avatar_url  !== undefined) auth.user.avatar_url  = updated.avatar_url
        if (updated.display_name !== undefined) auth.user.display_name = updated.display_name
        // Persist to sessionStorage so sidebar / AppHeader update immediately
        sessionStorage.setItem('auth_user', JSON.stringify(auth.user))
      }
    } catch (e: any) {
      error.value = e.response?.data?.error?.message ?? (e instanceof Error ? e.message : 'Connection error')
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
