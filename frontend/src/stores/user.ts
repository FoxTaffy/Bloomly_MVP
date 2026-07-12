import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from './auth'
import api from '@/api'

// ── Static species list (must match backend FURSONA_SPECIES) ─────────────────
export const FURSONA_SPECIES = [
  'Canine', 'Feline', 'Dragon', 'Protogen', 'Avian', 'Equine',
  'Reptile', 'Rodent', 'Ursine', 'Bovine', 'Cervine', 'Mustelid',
  'Sergal', 'Dutch Angel Dragon', 'Shark', 'Bat', 'Fox', 'Wolf',
  'Rabbit', 'Tiger', 'Hyena', 'Synth', 'Wickerbeast',
  'Lion', 'Leopard', 'Snow Leopard', 'Cheetah', 'Lynx',
  'Raccoon', 'Red Panda', 'Skunk', 'Opossum', 'Coyote',
  'Jackal', 'Panda', 'Dolphin', 'Orca', 'Seal',
  'Gryphon', 'Phoenix', 'Unicorn', 'Naga', 'Frog',
  'Maned Wolf', 'African Wild Dog', 'Kitsune', 'Tanuki', 'Kirin',
  'Wyvern', 'Kangaroo', 'Hedgehog', 'Otter', 'Ferret',
  'Meerkat', 'Axolotl', 'Octopus', 'Salamander', 'Primate',
  'Demon', 'Angel', 'Alien', 'Kobold', 'Sphinx',
  'Arctic Fox', 'Cow', 'Horse', 'Sheep', 'Goat', 'Pig',
  'Squirrel', 'Weasel', 'Badger', 'Serval', 'Caracal',
  'Cougar', 'Jaguar', 'Husky', 'Werewolf', 'Centaur',
  'Other',
] as const

export type FursonaSpecies = typeof FURSONA_SPECIES[number]

// ── Fursona ───────────────────────────────────────────────────────────────────
export interface Fursona {
  id: string
  user_id: string
  name: string
  species: string[]
  species_other: string | null
  colors: string[]
  likes_dislikes_visible: boolean
  likes: string[]
  dislikes: string[]
  created_at: string
  updated_at: string
}

export interface UpsertFursonaInput {
  name?: string
  species?: string[]
  species_other?: string | null
  colors?: string[]
  likes_dislikes_visible?: boolean
  likes?: string[]
  dislikes?: string[]
}

// ── Fursona reference gallery ────────────────────────────────────────────────
export interface FursonaReferenceImage {
  id: string
  user_id: string
  image_url: string
  is_nsfw: boolean
  artist_name: string | null
  artist_url: string | null
  created_at: string
  updated_at: string
}

export interface UpsertReferenceImageInput {
  image_url?: string | null
  is_nsfw?: boolean
  artist_name?: string | null
  artist_url?: string | null
}

// ── Fursuit ───────────────────────────────────────────────────────────────────
export interface Fursuit {
  id: string
  user_id: string
  image_url: string | null
  maker_id: string | null
  external_maker_links: string[]
  description: string | null
  is_nsfw: boolean
  created_at: string
  updated_at: string
}

export interface UpsertFursuitInput {
  image_url?: string | null
  maker_id?: string | null
  external_maker_links?: string[]
  description?: string | null
  is_nsfw?: boolean
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  avatar_video_url: string | null
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
  birth_date_visibility: string
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
  messages_privacy?: string
  comments_privacy?: string
  mentions_privacy?: string
  online_status_visibility?: string
  friends_list_visibility?: string
  profile_visibility?: string
  is_private?: boolean
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
  birth_date_visibility?: string
  relationship_since?: string | null
  social_links?: Record<string, string> | null
  interests?: string[]
  subscription_tier?: string
  profile_theme?: string | null
  profile_bg_url?: string | null
  profile_frame?: string | null
  artist_since?: string | null
  onboarding_done?: boolean
  messages_privacy?: string
  comments_privacy?: string
  mentions_privacy?: string
  online_status_visibility?: string
  friends_list_visibility?: string
  profile_visibility?: string
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useUserStore = defineStore('user', () => {
  // ── State ─────────────────────────────────────────────────────────────────
  const profile        = ref<UserProfile | null>(null)
  const isLoading      = ref(false)
  const error          = ref<string | null>(null)

  // Fursona state
  const fursona        = ref<Fursona | null>(null)
  const fursonaLoading = ref(false)

  // Fursuits state
  const fursuits        = ref<Fursuit[]>([])
  const fursuitsLoading = ref(false)

  // Fursona reference gallery state
  const referenceImages        = ref<FursonaReferenceImage[]>([])
  const referenceImagesLoading = ref(false)



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

  // ── Fursona actions ────────────────────────────────────────────────────────

  async function fetchFursona(userId: string): Promise<void> {
    fursonaLoading.value = true
    try {
      const res = await api.get(`/users/${userId}/fursona`)
      if (res.data.success) fursona.value = res.data.data.fursona
    } catch {
      fursona.value = null
    } finally {
      fursonaLoading.value = false
    }
  }

  async function saveFursona(input: UpsertFursonaInput): Promise<void> {
    fursonaLoading.value = true
    try {
      const res = await api.put('/users/me/fursona', input)
      if (!res.data.success) throw new Error(res.data.error?.message ?? 'Failed to save fursona')
      fursona.value = res.data.data.fursona
    } catch (e: any) {
      throw e
    } finally {
      fursonaLoading.value = false
    }
  }

  // ── Fursuit actions ────────────────────────────────────────────────────────

  async function fetchFursuits(userId: string): Promise<void> {
    fursuitsLoading.value = true
    try {
      const res = await api.get(`/users/${userId}/fursuits`)
      if (res.data.success) fursuits.value = res.data.data.fursuits
    } catch {
      fursuits.value = []
    } finally {
      fursuitsLoading.value = false
    }
  }

  async function createFursuit(input: UpsertFursuitInput): Promise<Fursuit> {
    const res = await api.post('/users/me/fursuits', input)
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Failed to create fursuit')
    const created = res.data.data.fursuit as Fursuit
    fursuits.value.push(created)
    return created
  }

  async function updateFursuit(id: string, input: UpsertFursuitInput): Promise<void> {
    const res = await api.put(`/users/me/fursuits/${id}`, input)
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Failed to update fursuit')
    const updated = res.data.data.fursuit as Fursuit
    const idx = fursuits.value.findIndex((f) => f.id === id)
    if (idx !== -1) fursuits.value[idx] = updated
  }

  async function deleteFursuit(id: string): Promise<void> {
    await api.delete(`/users/me/fursuits/${id}`)
    fursuits.value = fursuits.value.filter((f) => f.id !== id)
  }

  // ── Fursona reference gallery actions ────────────────────────────────────────

  async function fetchReferenceImages(userId: string): Promise<void> {
    referenceImagesLoading.value = true
    try {
      const res = await api.get(`/users/${userId}/fursona/references`)
      if (res.data.success) referenceImages.value = res.data.data.referenceImages
    } catch {
      referenceImages.value = []
    } finally {
      referenceImagesLoading.value = false
    }
  }

  async function addReferenceImage(input: UpsertReferenceImageInput): Promise<FursonaReferenceImage> {
    const res = await api.post('/users/me/fursona/references', input)
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Failed to add reference image')
    const created = res.data.data.referenceImage as FursonaReferenceImage
    referenceImages.value.push(created)
    return created
  }

  async function updateReferenceImage(id: string, input: UpsertReferenceImageInput): Promise<void> {
    const res = await api.put(`/users/me/fursona/references/${id}`, input)
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Failed to update reference image')
    const updated = res.data.data.referenceImage as FursonaReferenceImage
    const idx = referenceImages.value.findIndex((r) => r.id === id)
    if (idx !== -1) referenceImages.value[idx] = updated
  }

  async function deleteReferenceImage(id: string): Promise<void> {
    await api.delete(`/users/me/fursona/references/${id}`)
    referenceImages.value = referenceImages.value.filter((r) => r.id !== id)
  }

  return {
    profile,
    isLoading,
    error,
    fetchProfile,
    fetchMyProfile,
    updateProfile,
    // Fursona
    fursona,
    fursonaLoading,
    fetchFursona,
    saveFursona,
    // Fursuit
    fursuits,
    fursuitsLoading,
    fetchFursuits,
    createFursuit,
    updateFursuit,
    deleteFursuit,
    // Fursona reference gallery
    referenceImages,
    referenceImagesLoading,
    fetchReferenceImages,
    addReferenceImage,
    updateReferenceImage,
    deleteReferenceImage,
  }
})
