import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ShopItem {
  id: string
  type: 'theme' | 'background' | 'frame' | 'sticker_pack' | string
  name: string
  description: string | null
  preview_url: string | null
  price: string | number
  currency: string
  is_free: boolean
  is_official: boolean
  is_nsfw: boolean
  tags: string[]
  content_data: Record<string, unknown>
  downloads_count: number
  created_at: string
  owned?: boolean
  purchased_at?: string
}

export const useShopStore = defineStore('shop', () => {
  const items = ref<ShopItem[]>([])
  const myItems = ref<ShopItem[]>([])
  const total = ref(0)
  const loading = ref(false)
  const purchasing = ref<string | null>(null)

  async function loadItems(opts: { type?: string; page?: number; limit?: number } = {}) {
    loading.value = true
    try {
      const params: Record<string, string | number> = { page: opts.page ?? 1, limit: opts.limit ?? 24 }
      if (opts.type && opts.type !== 'all') params.type = opts.type
      const { data } = await api.get('/shop/items', { params })
      if (data.success) {
        items.value = data.data.items
        total.value = data.data.total
      }
    } finally {
      loading.value = false
    }
  }

  async function loadMyItems(type?: string) {
    const params: Record<string, string> = {}
    if (type && type !== 'all') params.type = type
    const { data } = await api.get('/shop/my', { params })
    if (data.success) myItems.value = data.data
  }

  async function purchaseItem(itemId: string): Promise<{ ok: boolean; error?: string }> {
    purchasing.value = itemId
    try {
      await api.post(`/shop/items/${itemId}/purchase`)
      // Mark as owned in local state
      const idx = items.value.findIndex((i) => i.id === itemId)
      if (idx !== -1) items.value[idx] = { ...items.value[idx], owned: true }
      return { ok: true }
    } catch (e: any) {
      return { ok: false, error: e.response?.data?.error?.message ?? 'Ошибка покупки' }
    } finally {
      purchasing.value = null
    }
  }

  return { items, myItems, total, loading, purchasing, loadItems, loadMyItems, purchaseItem }
})
