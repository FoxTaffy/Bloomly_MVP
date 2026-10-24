import { apiErrorMessage } from '@/lib/apiError'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
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
  const loadingMore = ref(false)
  const purchasing = ref<string | null>(null)

  const page = ref(1)
  const PAGE_SIZE = 24
  let loadSeq = 0

  /** Каталог с серверным поиском и сортировкой; append=true дописывает следующую страницу. */
  async function loadItems(opts: { type?: string; q?: string; sort?: string; append?: boolean } = {}) {
    const seq = ++loadSeq // ответ устаревшего запроса (быстрая смена вкладки) отбрасываем
    const nextPage = opts.append ? page.value + 1 : 1
    loading.value = !opts.append
    loadingMore.value = !!opts.append
    try {
      const params: Record<string, string | number> = { page: nextPage, limit: PAGE_SIZE }
      if (opts.type && opts.type !== 'all') params.type = opts.type
      if (opts.q?.trim()) params.q = opts.q.trim()
      if (opts.sort && opts.sort !== 'newest') params.sort = opts.sort
      const { data } = await api.get('/shop/items', { params })
      if (seq !== loadSeq) return
      if (data.success) {
        items.value = opts.append ? [...items.value, ...data.data.items] : data.data.items
        total.value = data.data.total
        page.value = nextPage
      }
    } finally {
      if (seq === loadSeq) { loading.value = false; loadingMore.value = false }
    }
  }

  const hasMore = computed(() => items.value.length < total.value)

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
      if (idx !== -1) items.value[idx] = { ...items.value[idx], owned: true, downloads_count: items.value[idx].downloads_count + 1 }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: apiErrorMessage(e) ?? 'Ошибка покупки' }
    } finally {
      purchasing.value = null
    }
  }

  return { items, myItems, total, loading, loadingMore, hasMore, purchasing, loadItems, loadMyItems, purchaseItem }
})
