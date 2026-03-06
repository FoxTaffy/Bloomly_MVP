export interface CreatePackInput {
  name: string;
  description?: string;
  coverUrl?: string;
  coverBgColor?: string;
  coverStickerIdx?: number | null;
  stickers?: string[];
  nsfwStickers?: number[];
  price?: number;
  currency?: string;
  tags?: string[];
  isNsfw?: boolean;
  status?: 'published' | 'draft';
}

export interface UpdatePackInput extends Partial<CreatePackInput> {}

export interface GetPacksQuery {
  page?: string;
  limit?: string;
  search?: string;
  authorId?: string;
  free?: string;     // '1' = only free
  status?: string;
}
