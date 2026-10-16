ALTER TABLE "StickerPack"
  ADD COLUMN IF NOT EXISTS "visibility"  VARCHAR(20) NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS "invite_code" VARCHAR(32);

-- Уже существующие платные паки остаются платными
UPDATE "StickerPack" SET "visibility" = 'paid' WHERE "price" > 0;

CREATE UNIQUE INDEX IF NOT EXISTS "StickerPack_invite_code_key" ON "StickerPack"("invite_code");
CREATE INDEX IF NOT EXISTS "StickerPack_visibility_idx" ON "StickerPack"("visibility");
