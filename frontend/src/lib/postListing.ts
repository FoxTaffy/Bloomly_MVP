// Превью лота Dealers' Den, которое сервер отдаёт вместе с постом (backend/src/lib/postListing.ts).
export interface PostListingPreview {
  id: string
  title: string
  images?: string[]
  price: string | number
  discount_percent?: number | null
  currency: string
  listing_kind: string
  status?: string
  is_nsfw?: boolean
  current_bid?: string | number | null
  group?: { safe_deals_enabled?: boolean } | null
}
