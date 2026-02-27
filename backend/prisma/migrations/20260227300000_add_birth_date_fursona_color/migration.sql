-- Add birth_date and fursona_color to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "birth_date" TIMESTAMP;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fursona_color" VARCHAR(50);
