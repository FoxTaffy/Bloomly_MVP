-- CreateTable: StickerUsage (per-user, per-sticker usage tracking)
CREATE TABLE "StickerUsage" (
    "id"          UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"     UUID        NOT NULL,
    "sticker_url" TEXT        NOT NULL,
    "pack_id"     UUID,
    "use_count"   INTEGER     NOT NULL DEFAULT 1,
    "last_used"   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "StickerUsage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StickerUsage_user_sticker_unique" UNIQUE ("user_id", "sticker_url")
);

-- CreateTable: StickerFavorite (per-user sticker favourites stored server-side)
CREATE TABLE "StickerFavorite" (
    "user_id"     UUID        NOT NULL,
    "sticker_url" TEXT        NOT NULL,
    "pack_id"     UUID,
    "added_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "StickerFavorite_pkey" PRIMARY KEY ("user_id", "sticker_url")
);

-- ForeignKeys
ALTER TABLE "StickerUsage"
    ADD CONSTRAINT "StickerUsage_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "StickerUsage"
    ADD CONSTRAINT "StickerUsage_pack_id_fkey"
    FOREIGN KEY ("pack_id") REFERENCES "StickerPack"("id") ON DELETE SET NULL;

ALTER TABLE "StickerFavorite"
    ADD CONSTRAINT "StickerFavorite_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE;

ALTER TABLE "StickerFavorite"
    ADD CONSTRAINT "StickerFavorite_pack_id_fkey"
    FOREIGN KEY ("pack_id") REFERENCES "StickerPack"("id") ON DELETE SET NULL;

-- Indexes
CREATE INDEX "StickerUsage_user_last_used_idx"   ON "StickerUsage"    ("user_id", "last_used" DESC);
CREATE INDEX "StickerUsage_user_use_count_idx"   ON "StickerUsage"    ("user_id", "use_count" DESC);
CREATE INDEX "StickerFavorite_user_added_at_idx" ON "StickerFavorite" ("user_id", "added_at"  DESC);
