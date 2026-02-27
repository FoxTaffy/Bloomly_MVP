-- Add fursona_photo_url to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fursona_photo_url" TEXT;
