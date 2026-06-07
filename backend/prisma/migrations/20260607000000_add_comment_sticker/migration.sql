-- Add sticker support to comments
ALTER TABLE "Comment"
  ADD COLUMN IF NOT EXISTS "type"     TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS "file_url" TEXT;
