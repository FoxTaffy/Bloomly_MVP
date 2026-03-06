import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

// ── Types ──────────────────────────────────────────────────────────────────────
export type ListingStatus   = 'active' | 'sold' | 'draft' | 'archived'
export type ListingCategory = 'art' | 'fursuit' | 'badge' | 'print' | 'music' | 'craft' | 'merch' | 'other'
export type ListingType     = 'digital' | 'physical' | 'both'

export interface ListingSeller {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  verification_type: string | null
}

export interface DealerListing {
  id: string
  seller_id: string
  title: string
  description: string | null
  price: string      // Decimal → string from Prisma
  currency: string
  category: ListingCategory
  type: ListingType
  images: string[]
  status: ListingStatus
  quantity: number
  quantity_sold: number
  is_nsfw: boolean
  tags: string[]
  created_at: string
  updated_at: string
  seller: ListingSeller
}

export interface CreateListingInput {
  title: string
  description?: string
  price: number
  currency?: string
  category?: ListingCategory
  type?: ListingType
  images?: string[]
  quantity?: number
  isNsfw?: boolean
  tags?: string[]
  status?: ListingStatus
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useDealersDenStore = defineStore('dealersDen', () => {
  const listings      = ref<DealerListing[]>([])
  const currentListing = ref<DealerListing | null>(null)
  const myListings    = ref<DealerListing[]>([])
  const isLoading     = ref(false)
  const total         = ref(0)

  // ── Actions ──────────────────────────────────────────────────────────────

  async function loadListings(params?: {
    page?: number; limit?: number; category?: string
    type?: string; search?: string; sellerId?: string
    minPrice?: number; maxPrice?: number; currency?: string
  }) {
    isLoading.value = true
    try {
      const { data } = await api.get('/dealers-den', { params })
      listings.value = data.data.listings
      total.value    = data.data.total
    } finally {
      isLoading.value = false
    }
  }

  async function loadListing(id: string) {
    isLoading.value = true
    try {
      const { data } = await api.get(`/dealers-den/${id}`)
      currentListing.value = data.data.listing
      return data.data.listing as DealerListing
    } finally {
      isLoading.value = false
    }
  }

  async function loadMyListings() {
    const { data } = await api.get('/dealers-den/me')
    myListings.value = data.data.listings
    return myListings.value
  }

  async function createListing(input: CreateListingInput) {
    const { data } = await api.post('/dealers-den', input)
    const listing = data.data.listing as DealerListing
    myListings.value.unshift(listing)
    return listing
  }

  async function updateListing(id: string, input: Partial<CreateListingInput>) {
    const { data } = await api.patch(`/dealers-den/${id}`, input)
    const updated = data.data.listing as DealerListing
    const idx = listings.value.findIndex(l => l.id === id)
    if (idx !== -1) listings.value[idx] = updated
    const midx = myListings.value.findIndex(l => l.id === id)
    if (midx !== -1) myListings.value[midx] = updated
    if (currentListing.value?.id === id) currentListing.value = updated
    return updated
  }

  async function deleteListing(id: string) {
    await api.delete(`/dealers-den/${id}`)
    listings.value    = listings.value.filter(l => l.id !== id)
    myListings.value  = myListings.value.filter(l => l.id !== id)
    if (currentListing.value?.id === id) currentListing.value = null
  }

  return {
    listings, currentListing, myListings, isLoading, total,
    loadListings, loadListing, loadMyListings,
    createListing, updateListing, deleteListing,
  }
})
