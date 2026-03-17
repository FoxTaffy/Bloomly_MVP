export interface ShopItemPublic {
  id: string;
  type: string;
  name: string;
  description?: string | null;
  preview_url?: string | null;
  price: number;
  currency: string;
  is_free: boolean;
  is_official: boolean;
  is_nsfw: boolean;
  tags: string[];
  content_data: Record<string, unknown>;
  downloads_count: number;
  created_at: string;
  owned?: boolean;
}

export const ITEM_SELECT = {
  id: true,
  type: true,
  name: true,
  description: true,
  preview_url: true,
  price: true,
  currency: true,
  is_free: true,
  is_official: true,
  is_nsfw: true,
  tags: true,
  content_data: true,
  downloads_count: true,
  created_at: true,
  deleted_at: true,
} as const;
