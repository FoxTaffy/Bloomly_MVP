export type ListingStatus   = 'active' | 'sold' | 'draft' | 'archived';
export type ListingCategory = 'art' | 'fursuit' | 'badge' | 'print' | 'music' | 'craft' | 'merch' | 'other';
export type ListingType     = 'digital' | 'physical' | 'both';
export type ListingKind     = 'fixed' | 'auction' | 'ych' | 'raffle';

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
  isNsfw?: string;     // 'true' | 'false' — фильтр по NSFW
  excludeNsfw?: string; // '1' — скрыть NSFW
}

export interface PlaceBidInput {
  amount: number;
  message?: string;
}
