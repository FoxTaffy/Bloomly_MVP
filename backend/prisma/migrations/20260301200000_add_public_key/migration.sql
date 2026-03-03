-- Add E2E public key field to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "public_key" TEXT;
