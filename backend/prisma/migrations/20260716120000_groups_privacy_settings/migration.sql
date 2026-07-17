-- AlterTable
ALTER TABLE "User" ADD COLUMN "groups_visibility" VARCHAR(20) NOT NULL DEFAULT 'everyone';
ALTER TABLE "User" ADD COLUMN "groups_pinned_only" BOOLEAN NOT NULL DEFAULT false;
