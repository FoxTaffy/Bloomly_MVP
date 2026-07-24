-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "two_factor_method" VARCHAR(10),
  ADD COLUMN "totp_secret" TEXT;
