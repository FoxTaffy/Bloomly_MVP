ALTER TABLE "StickerPack"
  ADD COLUMN IF NOT EXISTS "cover_bg_color"    VARCHAR(60),
  ADD COLUMN IF NOT EXISTS "cover_sticker_idx" INTEGER,
  ADD COLUMN IF NOT EXISTS "nsfw_stickers"     INTEGER[] NOT NULL DEFAULT '{}';
