-- CreateTable: MediaHistory
CREATE TABLE "MediaHistory" (
    "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID         NOT NULL,
    "type"       TEXT         NOT NULL,
    "url"        TEXT         NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaHistory_pkey" PRIMARY KEY ("id")
);

-- ForeignKey
ALTER TABLE "MediaHistory"
    ADD CONSTRAINT "MediaHistory_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index
CREATE INDEX "MediaHistory_user_id_idx" ON "MediaHistory"("user_id");
