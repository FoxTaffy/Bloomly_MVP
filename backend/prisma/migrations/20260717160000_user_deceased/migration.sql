-- AlterTable
ALTER TABLE "User" ADD COLUMN "deceased_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deceased_note" VARCHAR(300);
