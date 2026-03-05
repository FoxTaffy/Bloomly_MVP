export type ListingStatus = 'active' | 'sold' | 'draft' | 'archived';
export type ListingCategory = 'art' | 'fursuit' | 'badge' | 'print' | 'music' | 'craft' | 'merch' | 'other';
export type ListingType = 'digital' | 'physical' | 'both';

export interface CreateListingInput {
  title: string;
  description?: string;
  price: number;
  currency?: string;
  category?: ListingCategory;
  type?: ListingType;
  images?: string[];
  quantity?: number;
  isNsfw?: boolean;
  tags?: string[];
  status?: ListingStatus;
}

export interface UpdateListingInput extends Partial<CreateListingInput> {}

export interface GetListingsQuery {
  page?: string;
  limit?: string;
  category?: string;
  type?: string;
  status?: string;
  search?: string;
  sellerId?: string;
  minPrice?: string;
  maxPrice?: string;
  currency?: string;
}
