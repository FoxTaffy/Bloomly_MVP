import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

export type ApplicationStatus = 'pending' | 'contacted' | 'accepted' | 'declined'

/** Персонаж, выбранный в заявке: сам заявитель или его друг (+ его персонаж и доп. референсы заявителя) */
export interface CharacterDraft { userId: string; fursonaId: string | null; extraImages: string[] }

export interface CharacterOption {
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
  isSelf: boolean
  fursonas: { id: string; name: string; cover: string | null; refCount: number }[]
}

/** Персонаж с подтянутыми из профиля референсами */
export interface ResolvedCharacter {
  user: { id: string; username: string; display_name: string | null; avatar_url: string | null }
  fursona: { id: string; name: string; species: string[]; colors: string[] } | null
  images: { url: string; is_nsfw: boolean }[]
  extraImages: string[]
}

export interface ListingApplication {
  id: string
  message: string
  status: ApplicationStatus
  created_at: string
  resolved_at: string | null
  order_id: string | null
  characters: ResolvedCharacter[]
  applicant: {
    id: string
    username: string
    display_name: string | null
    avatar_url: string | null
    is_verified: boolean
    created_at: string
  }
  listing: {
    id: string
    title: string
    price: number | string
    discount_percent: number
    currency: string
    images: string[]
    is_nsfw: boolean
    status: string
  }
}

// Заявки на лоты Dealers' Den: подаются только в группу-продавца, группа пишет заявителю первой.
export const useListingApplicationsStore = defineStore('listingApplications', () => {
  /** Непросмотренные (pending) заявки по группам — для счётчиков в группе и инструментах. */
  const pendingByGroup = ref<Record<string, number>>({})

  async function submit(listingId: string, message: string, characters: CharacterDraft[] = []) {
    const { data } = await api.post(`/dealers-den/${listingId}/application`, { message, characters })
    return data.data.application as { id: string; status: ApplicationStatus; created_at: string }
  }

  async function getMine(listingId: string) {
    const { data } = await api.get(`/dealers-den/${listingId}/application/mine`)
    return (data.data.application ?? null) as
      { id: string; status: ApplicationStatus; created_at: string; orderId: string | null; orderStage: 'WAITING' | 'SKETCH' | 'LINEART' | 'COLORING' | 'FINISHED' | null; deadlineAt: string | null } | null
  }

  async function fetchForGroup(groupId: string, status?: ApplicationStatus) {
    const { data } = await api.get(`/dealers-den/groups/${groupId}/applications`, { params: status ? { status } : {} })
    const res = data.data as { applications: ListingApplication[]; pending: number }
    pendingByGroup.value[groupId] = res.pending
    return res
  }

  async function fetchPendingCount(groupId: string): Promise<number> {
    try {
      const { data } = await api.get(`/dealers-den/groups/${groupId}/applications/count`)
      pendingByGroup.value[groupId] = data.data.pending ?? 0
    } catch { /* счётчик не критичен */ }
    return pendingByGroup.value[groupId] ?? 0
  }

  async function fetchCharacterOptions(): Promise<CharacterOption[]> {
    const { data } = await api.get('/dealers-den/application-characters')
    return data.data.options as CharacterOption[]
  }

  async function setStatus(applicationId: string, status: ApplicationStatus) {
    const { data } = await api.patch(`/dealers-den/applications/${applicationId}`, { status })
    return data.data.application as { id: string; status: ApplicationStatus; resolved_at: string | null; order_id: string | null }
  }

  return { pendingByGroup, submit, getMine, fetchForGroup, fetchPendingCount, fetchCharacterOptions, setStatus }
})
