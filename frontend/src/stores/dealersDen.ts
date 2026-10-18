import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '../api'

// ── Types ──────────────────────────────────────────────────────────────────────
export type ListingStatus   = 'active' | 'sold' | 'draft' | 'archived'
export type ListingCategory = 'art' | 'fursuit' | 'badge' | 'print' | 'music' | 'craft' | 'merch' | 'sticker' | 'avatar_frame' | 'other'
export type ListingType     = 'digital' | 'physical' | 'both'
export type ListingKind     = 'fixed' | 'auction' | 'ych' | 'raffle' | 'commission_queue'

export const REVIEW_TAGS = ['быстро', 'качество', 'вежливый', 'точно как описано', 'рекомендую'] as const
export type ReviewTag = typeof REVIEW_TAGS[number]

export interface DenTrustScore {
  id: string
  user_id: string
  score: number
  tier: 'new' | 'reliable' | 'verified' | 'master' | 'elite'
  total_deals: number
  completed_deals: number
  disputes_lost: number
  avg_rating: string
  updated_at: string
}

export interface ListingSeller {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  is_verified: boolean
  verification_type: string | null
  den_trust_score?: DenTrustScore | null
  avg_response_hours?: number | null
  last_active_at?: string | null
}

export interface DealerBid {
  id: string
  listing_id: string
  bidder_id: string
  amount: string
  message: string | null
  created_at: string
  bidder: Pick<ListingSeller, 'id' | 'username' | 'display_name' | 'avatar_url'>
}

export interface DealerListingComment {
  id: string
  listing_id: string
  author_id: string
  body: string
  parent_id: string | null
  created_at: string
  author: Pick<ListingSeller, 'id' | 'username' | 'display_name' | 'avatar_url' | 'is_verified'>
  replies: DealerListingComment[]
}

export interface DenReview {
  id: string
  listing_id: string
  reviewer_id: string
  seller_id: string
  rating: number
  tags: string[]
  text: string | null
  photo_url: string | null
  created_at: string
  reviewer: Pick<ListingSeller, 'id' | 'username' | 'display_name' | 'avatar_url'>
}

export interface CommissionBooking {
  id: string
  listing_id: string
  buyer_id: string
  queue_position: number
  form_data: Record<string, unknown> | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  notes: string | null
  created_at: string
  updated_at: string
  buyer: Pick<ListingSeller, 'id' | 'username' | 'display_name' | 'avatar_url'>
}

export interface AvatarFrame {
  id: string
  listing_id: string | null
  creator_id: string
  name: string
  image_url: string
  price: string
  default_offset_x: number
  default_offset_y: number
  default_scale: number
  default_rotation: number
  status: 'pending' | 'approved' | 'rejected'
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  creator: Pick<ListingSeller, 'id' | 'username' | 'display_name' | 'avatar_url'>
}

export interface OwnedAvatarFrame extends AvatarFrame {
  offset_x: number
  offset_y: number
  scale: number
  rotation: number
}

export interface DenDispute {
  id: string
  listing_id: string
  buyer_id: string
  seller_id: string
  reason: string
  status: string
  seller_reply: string | null
  resolution: string | null
  opened_at: string
  replied_at: string | null
  resolved_at: string | null
}

export interface DenWeeklyTopEntry {
  id: string
  user_id: string
  rank: number
  week_start: string
  sales_count: number
  avg_rating: string
  new_reviews: number
  score: string
  user: Pick<ListingSeller, 'id' | 'username' | 'display_name' | 'avatar_url'> & { badge_type?: string | null }
}

export interface DenFair {
  id: string
  title: string
  description: string | null
  theme: string | null
  banner_url: string | null
  starts_at: string
  ends_at: string
  status: string
}

export interface ReviewSummary {
  avg_rating: number
  total: number
  tags: { tag: string; count: number }[]
}

export interface DealerListing {
  id: string
  seller_id: string
  group_id: string | null
  group?: { id: string; slug: string; name: string; avatar_url: string | null } | null
  title: string
  description: string | null
  price: string
  currency: string
  category: ListingCategory
  type: ListingType
  listing_kind: ListingKind
  images: string[]
  status: ListingStatus
  quantity: number
  quantity_sold: number
  is_nsfw: boolean
  tags: string[]
  // Auction / YCH
  auction_ends_at: string | null
  current_bid: string | null
  bid_count: number
  bid_increment: string
  auto_buy_price: string | null
  // Raffle
  raffle_max_tickets: number | null
  raffle_tickets_sold: number
  winner_id: string | null
  // Commission Queue
  commission_slots_total: number | null
  commission_slots_taken: number
  commission_eta_days: number | null
  commission_form_fields: { label: string; required: boolean; type: string }[] | null
  created_at: string
  updated_at: string
  seller: ListingSeller
  // Extended (from getById)
  wishlist_count?: number
  is_wishlisted?: boolean
  my_raffle_tickets?: number
  review_summary?: ReviewSummary
  // Present only when category === 'avatar_frame'
  avatarFrame?: {
    id: string
    status: 'pending' | 'approved' | 'rejected'
    rejection_reason: string | null
    default_offset_x: number
    default_offset_y: number
    default_scale: number
    default_rotation: number
  } | null
}

export interface CreateListingInput {
  groupId: string
  title: string
  description?: string
  price: number
  currency?: string
  category?: ListingCategory
  type?: ListingType
  listingKind?: ListingKind
  images?: string[]
  quantity?: number
  isNsfw?: boolean
  tags?: string[]
  status?: ListingStatus
  // auction / ych
  auctionEndsAt?: string
  bidIncrement?: number
  autoBuyPrice?: number
  // raffle
  raffleMaxTickets?: number
  // commission
  commissionSlotsTotal?: number
  commissionEtaDays?: number
  commissionFormFields?: { label: string; required: boolean; type: string }[]
}

export const LISTINGS_PAGE_SIZE = 20

export interface ListingsParams {
  category?: string; type?: string; search?: string; sellerId?: string; groupId?: string
  minPrice?: number; maxPrice?: number; currency?: string
  listingKind?: string; sort?: string; excludeNsfw?: string
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useDealersDenStore = defineStore('dealersDen', () => {
  const listings       = ref<DealerListing[]>([])
  const listingsPage   = ref(1)
  const currentListing = ref<DealerListing | null>(null)
  const myListings     = ref<DealerListing[]>([])
  const wishlist       = ref<DealerListing[]>([])
  const weeklyTop      = ref<DenWeeklyTopEntry[]>([])
  const isLoading      = ref(false)
  const total          = ref(0)

  // ── Listings ──────────────────────────────────────────────────────────────

  // Every listing request bumps this counter; a response is applied only if no newer
  // request started after it, so fast filter changes can't leave a stale list on screen.
  let listRequestSeq = 0
  const isLoadingMore = ref(false)

  async function loadListings(params?: ListingsParams) {
    const seq = ++listRequestSeq
    isLoading.value = true
    try {
      const { data } = await api.get('/dealers-den', { params: { ...params, page: 1, limit: LISTINGS_PAGE_SIZE } })
      if (seq !== listRequestSeq) return
      listings.value     = data.data.listings
      total.value        = data.data.total
      listingsPage.value = 1
    } finally {
      if (seq === listRequestSeq) isLoading.value = false
    }
  }

  // Appends the next page to the current listings (same filters as the last loadListings call).
  async function loadMoreListings(params?: ListingsParams) {
    const seq = ++listRequestSeq
    isLoadingMore.value = true
    try {
      const nextPage = listingsPage.value + 1
      const { data } = await api.get('/dealers-den', { params: { ...params, page: nextPage, limit: LISTINGS_PAGE_SIZE } })
      if (seq !== listRequestSeq) return
      listings.value     = [...listings.value, ...data.data.listings]
      total.value        = data.data.total
      listingsPage.value = nextPage
    } finally {
      if (seq === listRequestSeq) isLoadingMore.value = false
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
    listings.value   = listings.value.filter(l => l.id !== id)
    myListings.value = myListings.value.filter(l => l.id !== id)
    if (currentListing.value?.id === id) currentListing.value = null
  }

  // ── Auction / Raffle ──────────────────────────────────────────────────────

  async function placeBid(listingId: string, amount: number, message?: string) {
    const { data } = await api.post(`/dealers-den/${listingId}/bid`, { amount, message })
    const updated = data.data.listing as DealerListing
    const idx = listings.value.findIndex(l => l.id === listingId)
    if (idx !== -1) listings.value[idx] = updated
    if (currentListing.value?.id === listingId) currentListing.value = updated
    return data.data as { bid: DealerBid; listing: DealerListing }
  }

  async function getBids(listingId: string) {
    const { data } = await api.get(`/dealers-den/${listingId}/bids`)
    return data.data.bids as DealerBid[]
  }

  // Seller draws a raffle winner from the sold tickets.
  async function drawRaffle(listingId: string) {
    const { data } = await api.post(`/dealers-den/${listingId}/draw`)
    const updated = data.data.listing as DealerListing
    const idx = listings.value.findIndex(l => l.id === listingId)
    if (idx !== -1) listings.value[idx] = updated
    if (currentListing.value?.id === listingId) currentListing.value = updated
    return updated
  }

  async function buyRaffleTicket(listingId: string) {
    const { data } = await api.post(`/dealers-den/${listingId}/ticket`)
    const updated = data.data.listing as DealerListing
    const idx = listings.value.findIndex(l => l.id === listingId)
    if (idx !== -1) listings.value[idx] = updated
    return updated
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  async function getComments(listingId: string) {
    const { data } = await api.get(`/dealers-den/${listingId}/comments`)
    return data.data.comments as DealerListingComment[]
  }

  async function addComment(listingId: string, body: string, parentId?: string) {
    const { data } = await api.post(`/dealers-den/${listingId}/comments`, { body, parentId })
    return data.data.comment as DealerListingComment
  }

  async function deleteComment(commentId: string) {
    await api.delete(`/dealers-den/comments/${commentId}`)
  }

  // ── Trust ─────────────────────────────────────────────────────────────────

  async function getTrust(userId: string) {
    const { data } = await api.get(`/dealers-den/trust/${userId}`)
    return data.data.trust as DenTrustScore | null
  }

  // ── Reviews ───────────────────────────────────────────────────────────────

  async function createReview(listingId: string, input: { rating: number; tags?: string[]; text?: string; photoUrl?: string }) {
    const { data } = await api.post(`/dealers-den/${listingId}/review`, input)
    return data.data.review as DenReview
  }

  async function getListingReviews(listingId: string) {
    const { data } = await api.get(`/dealers-den/${listingId}/reviews`)
    return data.data.reviews as DenReview[]
  }

  async function getSellerReviews(userId: string) {
    const { data } = await api.get(`/dealers-den/seller/${userId}/reviews`)
    return data.data as { reviews: DenReview[]; avgRating: number; totalCount: number }
  }

  async function deleteReview(reviewId: string) {
    await api.delete(`/dealers-den/reviews/${reviewId}`)
  }

  // ── Weekly Top ────────────────────────────────────────────────────────────

  async function loadWeeklyTop() {
    const { data } = await api.get('/dealers-den/weekly-top')
    weeklyTop.value = data.data.top
    return data.data as { top: DenWeeklyTopEntry[]; weekStart: string }
  }

  // ── Wishlist ──────────────────────────────────────────────────────────────

  async function addToWishlist(listingId: string) {
    const { data } = await api.post(`/dealers-den/${listingId}/wishlist`)
    return data.data as { added: boolean }
  }

  async function removeFromWishlist(listingId: string) {
    await api.delete(`/dealers-den/${listingId}/wishlist`)
    wishlist.value = wishlist.value.filter(l => l.id !== listingId)
  }

  async function loadMyWishlist() {
    const { data } = await api.get('/dealers-den/wishlist/my')
    wishlist.value = data.data.listings
    return wishlist.value
  }

  // ── Commission Bookings ───────────────────────────────────────────────────

  async function createBooking(listingId: string, formData?: Record<string, unknown>) {
    const { data } = await api.post(`/dealers-den/${listingId}/booking`, { formData })
    return data.data as { booking: CommissionBooking; queuePosition: number }
  }

  async function getBookings(listingId: string) {
    const { data } = await api.get(`/dealers-den/${listingId}/bookings`)
    return data.data.bookings as CommissionBooking[]
  }

  async function updateBooking(bookingId: string, status: string, notes?: string) {
    const { data } = await api.patch(`/dealers-den/bookings/${bookingId}`, { status, notes })
    return data.data.booking as CommissionBooking
  }

  async function cancelBooking(bookingId: string) {
    await api.delete(`/dealers-den/bookings/${bookingId}`)
  }

  // ── Disputes ──────────────────────────────────────────────────────────────

  async function createDispute(listingId: string, reason: string) {
    const { data } = await api.post(`/dealers-den/${listingId}/dispute`, { reason })
    return data.data.dispute as DenDispute
  }

  async function replyDispute(disputeId: string, reply: string) {
    const { data } = await api.post(`/dealers-den/disputes/${disputeId}/reply`, { reply })
    return data.data.dispute as DenDispute
  }

  async function getMyDisputes() {
    const { data } = await api.get('/dealers-den/disputes/my')
    return data.data.disputes as DenDispute[]
  }

  // ── Seller page ───────────────────────────────────────────────────────────

  async function getSellerPage(username: string) {
    const { data } = await api.get(`/dealers-den/seller/${username}`)
    return data.data
  }

  // ── Fairs ─────────────────────────────────────────────────────────────────

  async function getCurrentFair() {
    const { data } = await api.get('/dealers-den/fairs/current')
    return data.data
  }

  async function getFair(fairId: string) {
    const { data } = await api.get(`/dealers-den/fairs/${fairId}`)
    return data.data
  }

  async function applyToFair(fairId: string, listingId?: string) {
    const { data } = await api.post(`/dealers-den/fairs/${fairId}/apply`, { listingId })
    return data.data
  }

  // ── Avatar frames ─────────────────────────────────────────────────────────

  async function createAvatarFrame(input: {
    name: string
    imageUrl: string
    price?: number
    tags?: string[]
    defaultOffsetX?: number
    defaultOffsetY?: number
    defaultScale?: number
    defaultRotation?: number
  }) {
    const { data } = await api.post('/avatar-frames', input)
    return data.data.frame as AvatarFrame
  }

  async function getTrendingTags() {
    const { data } = await api.get('/dealers-den/tags/trending')
    return data.data.tags as { tag: string; count: number }[]
  }

  async function claimAvatarFrame(frameId: string) {
    const { data } = await api.post(`/avatar-frames/${frameId}/claim`)
    return data.data.owned as OwnedAvatarFrame
  }

  async function updateFrameCalibration(frameId: string, input: { offsetX?: number; offsetY?: number; scale?: number; rotation?: number }) {
    const { data } = await api.patch(`/avatar-frames/${frameId}/calibration`, input)
    return data.data.owned as OwnedAvatarFrame
  }

  async function getMyAvatarFrames() {
    const { data } = await api.get('/avatar-frames/mine')
    return data.data.frames as OwnedAvatarFrame[]
  }

  async function adminGetFrameSubmissions(status?: string, page = 1) {
    const { data } = await api.get('/admin/avatar-frames', { params: { status, page } })
    return data.data as { submissions: AvatarFrame[]; total: number; page: number; limit: number }
  }

  async function adminReviewFrame(frameId: string, action: 'approve' | 'reject', reason?: string) {
    const { data } = await api.patch(`/admin/avatar-frames/${frameId}`, { action, reason })
    return data.data.frame as AvatarFrame
  }

  return {
    listings, currentListing, myListings, wishlist, weeklyTop, isLoading, isLoadingMore, total,
    // Listings
    loadListings, loadMoreListings, loadListing, loadMyListings, createListing, updateListing, deleteListing,
    // Auction/Raffle
    placeBid, getBids, buyRaffleTicket, drawRaffle,
    // Comments
    getComments, addComment, deleteComment,
    // Trust
    getTrust,
    // Reviews
    createReview, getListingReviews, getSellerReviews, deleteReview,
    // Weekly Top
    loadWeeklyTop,
    // Wishlist
    addToWishlist, removeFromWishlist, loadMyWishlist,
    // Bookings
    createBooking, getBookings, updateBooking, cancelBooking,
    // Disputes
    createDispute, replyDispute, getMyDisputes,
    // Seller page
    getSellerPage,
    // Fairs
    getCurrentFair, getFair, applyToFair,
    // Avatar frames
    createAvatarFrame, claimAvatarFrame, updateFrameCalibration, getMyAvatarFrames,
    adminGetFrameSubmissions, adminReviewFrame, getTrendingTags,
  }
})
