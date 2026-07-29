-- AlterTable
ALTER TABLE "Group"
  ADD COLUMN "welcome_msg_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "welcome_msg_text" VARCHAR(300);
