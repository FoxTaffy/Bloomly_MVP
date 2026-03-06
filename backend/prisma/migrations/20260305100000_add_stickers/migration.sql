-- CreateTable StickerPack
CREATE TABLE "StickerPack" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id"      UUID NOT NULL,
    "name"           VARCHAR(120) NOT NULL,
    "description"    TEXT,
    "cover_url"      TEXT,
    "stickers"       TEXT[] DEFAULT ARRAY[]::TEXT[],
    "price"          DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency"       VARCHAR(10) NOT NULL DEFAULT 'USD',
    "tags"           TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_nsfw"        BOOLEAN NOT NULL DEFAULT false,
    "status"         VARCHAR(20) NOT NULL DEFAULT 'published',
    "downloads_count" INTEGER NOT NULL DEFAULT 0,
    "created_at"     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"     TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"     TIMESTAMP(6),

    CONSTRAINT "StickerPack_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StickerPack" ADD CONSTRAINT "StickerPack_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UserStickerPack (коллекция пользователя)
CREATE TABLE "UserStickerPack" (
    "user_id"   UUID NOT NULL,
    "pack_id"   UUID NOT NULL,
    "added_at"  TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserStickerPack_pkey" PRIMARY KEY ("user_id", "pack_id")
);

ALTER TABLE "UserStickerPack" ADD CONSTRAINT "UserStickerPack_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserStickerPack" ADD CONSTRAINT "UserStickerPack_pack_id_fkey"
    FOREIGN KEY ("pack_id") REFERENCES "StickerPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "StickerPack_author_id_idx" ON "StickerPack"("author_id");
CREATE INDEX "StickerPack_status_idx" ON "StickerPack"("status");
CREATE INDEX "StickerPack_created_at_idx" ON "StickerPack"("created_at" DESC);
CREATE INDEX "UserStickerPack_user_id_idx" ON "UserStickerPack"("user_id");
CREATE INDEX "UserStickerPack_pack_id_idx" ON "UserStickerPack"("pack_id");
