-- AlterTable
ALTER TABLE "RefreshToken"
  ADD COLUMN "remember" BOOLEAN NOT NULL DEFAULT false;
