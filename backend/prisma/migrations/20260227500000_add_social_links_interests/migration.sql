-- Add social_links (JSON) and interests (string array) to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "social_links" JSONB DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
