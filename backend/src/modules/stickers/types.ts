export type PackVisibility = 'own' | 'public' | 'invite' | 'paid';

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
  isNsfw?: boolean
  hideAuthor?: boolean
  visibility?: PackVisibility
  status?: 'published' | 'draft'
}

export interface UpdatePackInput extends Partial<CreatePackInput> {
  regenerateInvite?: boolean;
}

export interface GetPacksQuery {
  page?: string;
  limit?: string;
  search?: string;
  authorId?: string;
  free?: string;        // '1' = only free
  nsfw?: string;        // '1' = only nsfw packs
  excludeNsfw?: string; // '1' = exclude nsfw packs
  sort?: string;        // 'popular' | 'new'
  tag?: string;         // фильтр по тегу (animated, etc.)
  status?: string;
}
