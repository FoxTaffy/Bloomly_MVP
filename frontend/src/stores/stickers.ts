import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

// ── Types ──────────────────────────────────────────────────────────────────────
export interface PackAuthor {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  verification_type: string | null
}

export interface StickerPack {
  id: string
  author_id: string
  name: string
  description: string | null
  cover_url: string | null
  cover_bg_color: string | null
  cover_sticker_idx: number | null
  stickers: string[]
  nsfw_stickers: number[]
  price: string
  currency: string
  tags: string[]
  is_nsfw: boolean
  status: 'published' | 'draft'
  downloads_count: number
  created_at: string
  updated_at: string
  author: PackAuthor
  _count: { userCollections: number }
}

export interface CreatePackInput {
  name: string
  description?: string
  coverUrl?: string
  coverBgColor?: string
  coverStickerIdx?: number | null
  stickers?: string[]
  nsfwStickers?: number[]
  price?: number
  currency?: string
  tags?: string[]
  isNsfw?: boolean
  status?: 'published' | 'draft'
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useStickersStore = defineStore('stickers', () => {
  const packs          = ref<StickerPack[]>([])
  const currentPack    = ref<StickerPack | null>(null)
  const myPacks        = ref<StickerPack[]>([])
  const myCollection   = ref<StickerPack[]>([])
  const isLoading      = ref(false)
  const total          = ref(0)

  async function loadPacks(params?: {
    page?: number; limit?: number; search?: string
    authorId?: string; free?: boolean
  }) {
    isLoading.value = true
    try {
      const { data } = await api.get('/stickers', {
        params: {
          ...params,
          free: params?.free ? '1' : undefined,
        },
      })
      packs.value = data.data.packs
      total.value = data.data.total
    } finally {
      isLoading.value = false
    }
  }

  async function loadPack(id: string) {
    isLoading.value = true
    try {
      const { data } = await api.get(`/stickers/${id}`)
      currentPack.value = data.data.pack
      return data.data.pack as StickerPack
    } finally {
      isLoading.value = false
    }
  }

  async function loadMyPacks() {
    const { data } = await api.get('/stickers/me/packs')
    myPacks.value = data.data.packs
    return myPacks.value
  }

  async function loadMyCollection() {
    const { data } = await api.get('/stickers/me/collection')
    myCollection.value = data.data.packs
    return myCollection.value
  }

  async function createPack(input: CreatePackInput) {
    const { data } = await api.post('/stickers', input)
    const pack = data.data.pack as StickerPack
    myPacks.value.unshift(pack)
    return pack
  }

  async function updatePack(id: string, input: Partial<CreatePackInput>) {
    const { data } = await api.patch(`/stickers/${id}`, input)
    const updated = data.data.pack as StickerPack
    const idx  = packs.value.findIndex(p => p.id === id)
    if (idx !== -1) packs.value[idx] = updated
    const midx = myPacks.value.findIndex(p => p.id === id)
    if (midx !== -1) myPacks.value[midx] = updated
    if (currentPack.value?.id === id) currentPack.value = updated
    return updated
  }

  async function deletePack(id: string) {
    await api.delete(`/stickers/${id}`)
    packs.value   = packs.value.filter(p => p.id !== id)
    myPacks.value = myPacks.value.filter(p => p.id !== id)
    if (currentPack.value?.id === id) currentPack.value = null
  }

  async function addToCollection(packId: string) {
    await api.post(`/stickers/${packId}/collect`)
    const pack = packs.value.find(p => p.id === packId) ?? currentPack.value
    if (pack && !myCollection.value.find(p => p.id === packId)) {
      myCollection.value.unshift(pack)
    }
  }

  async function removeFromCollection(packId: string) {
    await api.delete(`/stickers/${packId}/collect`)
    myCollection.value = myCollection.value.filter(p => p.id !== packId)
  }

  async function checkCollected(packId: string) {
    try {
      const { data } = await api.get(`/stickers/${packId}/collected`)
      return data.data.has as boolean
    } catch {
      return false
    }
  }

  async function importFromTelegram(link: string, maxStickers = 60) {
    const { data } = await api.post('/stickers/import/telegram', { link, maxStickers })
    return data.data as {
      title: string
      tg_name: string
      total: number
      imported: number
      sticker_urls: string[]
    }
  }

  return {
    packs, currentPack, myPacks, myCollection, isLoading, total,
    loadPacks, loadPack, loadMyPacks, loadMyCollection,
    createPack, updatePack, deletePack,
    addToCollection, removeFromCollection, checkCollected,
    importFromTelegram,
  }
})
