-- CreateTable: заявки на доступ к стикерпаку по приглашению
CREATE TABLE "StickerAccessRequest" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "pack_id"    UUID NOT NULL,
    "user_id"    UUID NOT NULL,
    "status"     VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMP(6),

    CONSTRAINT "StickerAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StickerAccessRequest_pack_id_user_id_key" ON "StickerAccessRequest"("pack_id", "user_id");
CREATE INDEX "StickerAccessRequest_status_idx" ON "StickerAccessRequest"("status");

ALTER TABLE "StickerAccessRequest" ADD CONSTRAINT "StickerAccessRequest_pack_id_fkey"
    FOREIGN KEY ("pack_id") REFERENCES "StickerPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StickerAccessRequest" ADD CONSTRAINT "StickerAccessRequest_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
