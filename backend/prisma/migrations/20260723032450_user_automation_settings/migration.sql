-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "auto_follow_back" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "welcome_msg_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "welcome_msg_text" VARCHAR(300) NOT NULL DEFAULT 'Привет! Спасибо что подписался 🐾',
  ADD COLUMN "mute_keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "quiet_hours_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "quiet_hours_from" VARCHAR(5) NOT NULL DEFAULT '23:00',
  ADD COLUMN "quiet_hours_to" VARCHAR(5) NOT NULL DEFAULT '08:00',
  ADD COLUMN "notify_new_fan" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_comment" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notify_repaw" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "quick_replies" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "filter_spam" BOOLEAN NOT NULL DEFAULT true;
