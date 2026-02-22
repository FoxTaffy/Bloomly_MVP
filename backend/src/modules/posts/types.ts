export interface CreatePostInput {
  content: string;
  authorId: string;
  isNsfw?: boolean;
}

export type PostSortBy = 'date' | 'rating';

export interface JwtUser {
  id: string;
  role: string;
}
