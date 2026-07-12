-- AlterTable: Post gets media_original_urls, index-aligned with media_urls,
-- holding pre-compression source images for a "download original" option.
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "media_original_urls" TEXT[] NOT NULL DEFAULT '{}';
