-- Add prev_badge_type to User so a temporary badge (e.g. den_top_week) can
-- restore whatever badge the user had before, instead of destroying it.
ALTER TABLE "User" ADD COLUMN "prev_badge_type" TEXT;

-- Drop the GroupAchievement table: it had no write path anywhere in the
-- backend, so the feature was permanently dead (always empty).
DROP TABLE IF EXISTS "GroupAchievement";
