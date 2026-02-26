export interface CreatePostInput {
  content: string;
  authorId: string;
  isNsfw?: boolean;
  category?: string;
  tags?: string[];
  mediaUrls?: string[];
}

export type PostSortBy = 'new' | 'hot';

export interface GetPostsQuery {
  search?: string;
  category?: string;
  tag?: string;
  sort?: PostSortBy;
  safeMode?: boolean;
  hasMedia?: boolean;
}

export interface GetPersonalizedQuery {
  safeMode?: boolean;
}

export interface JwtUser {
  id: string;
  role: string;
}
