-- Add fursuit fields to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "has_fursuit"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fursuit_photo_url"   TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fursuit_description" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fursuit_maker"       VARCHAR(200);
