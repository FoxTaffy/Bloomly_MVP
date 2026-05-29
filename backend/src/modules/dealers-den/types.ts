export type ListingStatus   = 'active' | 'sold' | 'draft' | 'archived';
export type ListingCategory = 'art' | 'fursuit' | 'badge' | 'print' | 'music' | 'craft' | 'merch' | 'other';
export type ListingType     = 'digital' | 'physical' | 'both';
export type ListingKind     = 'fixed' | 'auction' | 'ych' | 'raffle' | 'commission_queue';

export const REVIEW_TAGS = ['быстро', 'качество', 'вежливый', 'точно как описано', 'рекомендую'] as const;
export type ReviewTag = typeof REVIEW_TAGS[number];

export interface CreateListingInput {
  title: string;
  description?: string;
  price: number;
  currency?: string;
  category?: ListingCategory;
  type?: ListingType;
  listingKind?: ListingKind;
  images?: string[];
  quantity?: number;
  isNsfw?: boolean;
  tags?: string[];
  status?: ListingStatus;
  // Auction / YCH
  auctionEndsAt?: string;
  bidIncrement?: number;
  autoBuyPrice?: number;
  // Raffle
  raffleMaxTickets?: number;
  // Commission Queue
  commissionSlotsTotal?: number;
  commissionEtaDays?: number;
  commissionFormFields?: Array<{ label: string; required: boolean; type: string }>;
}

export interface UpdateListingInput extends Partial<CreateListingInput> {}

export interface GetListingsQuery {
  page?: string;
  limit?: string;
  category?: string;
  type?: string;
  listingKind?: string;
  status?: string;
  search?: string;
  sellerId?: string;
  minPrice?: string;
  maxPrice?: string;
  currency?: string;
  sort?: string;        // 'newest' | 'price_asc' | 'price_desc' | 'popular'
  isNsfw?: string;     // 'true' | 'false'
  excludeNsfw?: string; // '1' — скрыть NSFW
}

export interface PlaceBidInput {
  amount: number;
  message?: string;
}

export interface CreateReviewInput {
  rating: number;
  tags?: string[];
  text?: string;
  photoUrl?: string;
}

export interface CreateBookingInput {
  formData?: Record<string, unknown>;
}

export interface UpdateBookingInput {
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  notes?: string;
}

export interface CreateDisputeInput {
  reason: string;
}

export interface ReplyDisputeInput {
  reply: string;
}

export interface ResolveDisputeInput {
  winner: 'buyer' | 'seller';
  resolution: string;
}

export interface CreateFairInput {
  title: string;
  description?: string;
  theme?: string;
  bannerUrl?: string;
  startsAt: string;
  endsAt: string;
}
