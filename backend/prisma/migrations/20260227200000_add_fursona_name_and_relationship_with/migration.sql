ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fursona_name" VARCHAR(80);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "relationship_with" uuid;
