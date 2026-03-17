import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
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
  hide_author: boolean
  status: 'published' | 'draft'
  downloads_count: number
  use_count: number
  created_at: string
  updated_at: string
  author: PackAuthor | null
  _count: { userCollections: number }
  in_collection?: boolean
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
  hideAuthor?: boolean
  status?: 'published' | 'draft'
}

// ── LocalStorage keys ─────────────────────────────────────────────────────────
const LS_RECENT   = 'bloomly_recent_stickers'
const LS_FAVORITE = 'bloomly_favorite_stickers'
const MAX_RECENT  = 30

function lsLoad(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}
function lsSave(key: string, arr: string[]) {
  try { localStorage.setItem(key, JSON.stringify(arr)) } catch {}
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useStickersStore = defineStore('stickers', () => {
  const packs          = ref<StickerPack[]>([])
  const currentPack    = ref<StickerPack | null>(null)
  const myPacks        = ref<StickerPack[]>([])
  const myCollection   = ref<StickerPack[]>([])
  const isLoading      = ref(false)
  const total          = ref(0)

  // ── Recent / Favorites (localStorage, fast + offline) ────────────────────
  const recentStickers   = ref<string[]>(lsLoad(LS_RECENT))
  const favoriteStickers = ref<string[]>(lsLoad(LS_FAVORITE))

  // ── Frequent stickers (from server, sorted by use_count) ─────────────────
  const frequentStickers = ref<string[]>([])

  function trackRecent(url: string) {
    const arr = recentStickers.value.filter(u => u !== url)
    arr.unshift(url)
    if (arr.length > MAX_RECENT) arr.length = MAX_RECENT
    recentStickers.value = arr
    lsSave(LS_RECENT, arr)
  }

  function toggleFavorite(url: string, packId?: string) {
    const arr = favoriteStickers.value.filter(u => u !== url)
    const wasPresent = arr.length < favoriteStickers.value.length
    if (!wasPresent) arr.unshift(url)
    favoriteStickers.value = arr
    lsSave(LS_FAVORITE, arr)
    // Sync to server in background (best-effort)
    if (!wasPresent) {
      api.post('/stickers/favorites', { stickerUrl: url, packId }).catch(() => {})
    } else {
      api.delete('/stickers/favorites', { data: { stickerUrl: url } }).catch(() => {})
    }
  }

  const isFavorite = computed(() => (url: string) => favoriteStickers.value.includes(url))

  // Load favorites from server and merge with localStorage
  async function loadFavoritesFromServer() {
    try {
      const { data } = await api.get('/stickers/favorites')
      const serverUrls: string[] = data.data.stickers.map((s: any) => s.url)
      // Merge: server is source of truth, but keep any local ones not yet synced
      const merged = Array.from(new Set([...serverUrls, ...favoriteStickers.value]))
      favoriteStickers.value = merged
      lsSave(LS_FAVORITE, merged)
    } catch { /* server unavailable, keep localStorage */ }
  }

  // Load frequency data from server
  async function loadFrequent() {
    try {
      const { data } = await api.get('/stickers/usage/recent', { params: { type: 'frequent', limit: 50 } })
      frequentStickers.value = data.data.stickers.map((s: any) => s.url)
    } catch { /* keep empty */ }
  }

  // Track sticker usage on server (best-effort)
  async function trackUsageRemote(url: string, packId?: string) {
    try { await api.post('/stickers/usage/track', { stickerUrl: url, packId }) } catch {}
  }

  // ── Increment use count ───────────────────────────────────────────────────
  async function incrementUse(packId: string) {
    try { await api.post(`/stickers/${packId}/use`) } catch {}
  }

  async function loadPacks(params?: {
    page?: number; limit?: number; search?: string
    authorId?: string; free?: boolean; nsfw?: string
    excludeNsfw?: string; sort?: string; tag?: string; status?: string
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

  async function addStickersToPack(id: string, urls: string[]) {
    const { data } = await api.post(`/stickers/${id}/stickers`, { urls })
    const updated = data.data.pack as StickerPack
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

  async function findPackByUrl(url: string): Promise<
    | null
    | { private: true }
    | { private: false; pack: StickerPack }
  > {
    try {
      const { data } = await api.get('/stickers/find-by-url', { params: { url } })
      if (!data.success || !data.data.found) return null
      if (data.data.private) return { private: true }
      return { private: false, pack: data.data.pack as StickerPack }
    } catch {
      return null
    }
  }

  return {
    packs, currentPack, myPacks, myCollection, isLoading, total,
    recentStickers, favoriteStickers, frequentStickers, isFavorite,
    trackRecent, toggleFavorite, incrementUse,
    loadFavoritesFromServer, loadFrequent, trackUsageRemote,
    loadPacks, loadPack, loadMyPacks, loadMyCollection,
    createPack, updatePack, addStickersToPack, deletePack,
    addToCollection, removeFromCollection, checkCollected,
    importFromTelegram, findPackByUrl,
  }
})
