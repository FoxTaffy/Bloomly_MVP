import type { NsfwMode } from '../../lib/contentFilters.js';
export interface CreatePostInput {
  content: string;
  authorId: string;
  isNsfw?: boolean;
  isAiGenerated?: boolean;
  isAnnouncement?: boolean;
  subscriberOnly?: boolean;
  isPaid?: boolean;
  price?: number;
  rewardForUserId?: string;
  videoTitle?: string;
  videoDescription?: string;
  category?: string;
  tags?: string[];
  mediaUrls?: string[];
  mediaOriginalUrls?: string[];
}

export type PostSortBy = 'new' | 'hot';

export interface GetPostsQuery {
  search?: string;
  category?: string;
  tag?: string;
  sort?: PostSortBy;
  safeMode?: string;
  nsfw?: string;
  /** Resolved by the controller from `nsfw`/`safeMode` + viewer age; the service never reads the raw params. */
  nsfwMode?: NsfwMode;
  hasMedia?: boolean;
  page?: string;
  limit?: string;
}

export interface GetPersonalizedQuery {
  safeMode?: string;
  nsfw?: string;
  page?: string;
  limit?: string;
}

export interface JwtUser {
  id: string;
  role: string;
}
