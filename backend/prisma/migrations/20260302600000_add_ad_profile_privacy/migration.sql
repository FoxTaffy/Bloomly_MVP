-- AlterTable
ALTER TABLE "AdProfile" ADD COLUMN IF NOT EXISTS "visibility" VARCHAR(20) NOT NULL DEFAULT 'public';
ALTER TABLE "AdProfile" ADD COLUMN IF NOT EXISTS "subscription_price" DECIMAL(10,2);
