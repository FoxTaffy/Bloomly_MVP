-- ShopItem: темы, фоны, рамки, стикеры как товары магазина
CREATE TABLE "ShopItem" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "type"        VARCHAR(20) NOT NULL, -- 'sticker_pack' | 'theme' | 'background' | 'frame'
  "name"        VARCHAR(120) NOT NULL,
  "description" TEXT,
  "preview_url" TEXT,
  "price"       DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency"    VARCHAR(10) NOT NULL DEFAULT 'RUB',
  "is_free"     BOOLEAN NOT NULL DEFAULT false,
  "is_official" BOOLEAN NOT NULL DEFAULT false, -- Официальный товар Bloomly
  "is_nsfw"     BOOLEAN NOT NULL DEFAULT false,
  "tags"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "content_data" JSONB NOT NULL DEFAULT '{}', -- { css, url, pack_id, etc. }
  "downloads_count" INT NOT NULL DEFAULT 0,
  "status"      VARCHAR(20) NOT NULL DEFAULT 'published', -- published | draft
  "ref_id"      UUID,                -- linked sticker_pack id if type=sticker_pack
  "created_at"  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"  TIMESTAMP(6),
  CONSTRAINT "ShopItem_pkey" PRIMARY KEY ("id")
);

-- UserShopItem: купленные пользователем товары
CREATE TABLE "UserShopItem" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      UUID NOT NULL,
  "item_id"      UUID NOT NULL,
  "purchased_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserShopItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserShopItem_user_id_item_id_key" UNIQUE ("user_id", "item_id"),
  CONSTRAINT "UserShopItem_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "UserShopItem_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ShopItem"("id") ON DELETE CASCADE
);

-- Кастомизация групп (только для business)
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "group_bg_url"  TEXT;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "group_frame"   VARCHAR(100);
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "group_theme"   VARCHAR(100);

CREATE INDEX "ShopItem_type_idx" ON "ShopItem"("type");
CREATE INDEX "ShopItem_status_idx" ON "ShopItem"("status");
CREATE INDEX "UserShopItem_user_id_idx" ON "UserShopItem"("user_id");
