-- Change display_name from TEXT to VARCHAR(50)
ALTER TABLE "User" ALTER COLUMN "display_name" TYPE VARCHAR(50);

-- Add profile fields to User
ALTER TABLE "User" ADD COLUMN "bio"          VARCHAR(300);
ALTER TABLE "User" ADD COLUMN "avatar_url"   TEXT;
ALTER TABLE "User" ADD COLUMN "banner_url"   TEXT;
ALTER TABLE "User" ADD COLUMN "status"       VARCHAR(100);
ALTER TABLE "User" ADD COLUMN "persona"      TEXT;
ALTER TABLE "User" ADD COLUMN "likes"        TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN "dislikes"     TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN "accent_color" TEXT;
