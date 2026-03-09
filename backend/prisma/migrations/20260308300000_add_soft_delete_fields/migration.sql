-- Migration: add_soft_delete_fields
-- Adds deleted_at to Story, Notification, Advertisement, Report
-- Adds updated_at to Story
-- Adds indexes for Story

-- Story: add updated_at and deleted_at
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Story_user_id_idx" ON "Story"("user_id");
CREATE INDEX IF NOT EXISTS "Story_created_at_idx" ON "Story"("created_at");

-- Notification: add deleted_at
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "Notification_receiver_deleted_at_idx" ON "Notification"("receiver_id", "deleted_at");

-- Advertisement: add deleted_at
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Report: add deleted_at
ALTER TABLE "Report" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
