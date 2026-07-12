export interface CreatePostInput {
  content: string;
  authorId: string;
  isNsfw?: boolean;
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
  safeMode?: boolean;
  hasMedia?: boolean;
  page?: string;
  limit?: string;
}

export interface GetPersonalizedQuery {
  safeMode?: boolean;
  page?: string;
  limit?: string;
}

export interface JwtUser {
  id: string;
  role: string;
}
