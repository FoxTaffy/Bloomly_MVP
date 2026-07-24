-- AlterTable
ALTER TABLE "User" ADD COLUMN "forward_identity_privacy" VARCHAR(20) NOT NULL DEFAULT 'everyone';
