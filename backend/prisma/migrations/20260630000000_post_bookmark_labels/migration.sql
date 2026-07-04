-- CreateTable: post bookmark labels (like Telegram folders / VK collections)
CREATE TABLE "PostBookmarkLabel" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID        NOT NULL,
    "name"       VARCHAR(60) NOT NULL,
    "color"      VARCHAR(20) NOT NULL DEFAULT '#4C67CF',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "PostBookmarkLabel_pkey" PRIMARY KEY ("id")
);

-- Add label_id to Favourite (nullable — unlabelled by default)
ALTER TABLE "Favourite" ADD COLUMN "label_id" UUID;

-- FK
ALTER TABLE "PostBookmarkLabel" ADD CONSTRAINT "PostBookmarkLabel_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Favourite" ADD CONSTRAINT "Favourite_label_id_fkey"
    FOREIGN KEY ("label_id") REFERENCES "PostBookmarkLabel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "PostBookmarkLabel_user_id_idx" ON "PostBookmarkLabel"("user_id");
CREATE INDEX "Favourite_label_id_idx" ON "Favourite"("label_id");
