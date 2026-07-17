-- DB audit cleanup (2026-07-16)

-- 1. Drop orphaned columns/constraints from the abandoned RSVP-approval + ticket-tier
--    + event-chat feature (migration 20260712130000_group_events_v2). These were never
--    added to schema.prisma and have zero references in backend/src — dead weight.
ALTER TABLE "EventAttendee" DROP CONSTRAINT IF EXISTS "EventAttendee_ticket_tier_id_fkey";
ALTER TABLE "EventAttendee" DROP COLUMN IF EXISTS "ticket_tier_id";
ALTER TABLE "EventAttendee" DROP COLUMN IF EXISTS "payment_deadline_at";
ALTER TABLE "EventAttendee" DROP COLUMN IF EXISTS "decided_at";
ALTER TABLE "EventAttendee" DROP COLUMN IF EXISTS "decided_by";

ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_attendees_chat_id_fkey";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "requires_approval";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "payment_deadline_hours";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "location_visibility";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "unlock_chat_on_approval";
ALTER TABLE "Event" DROP COLUMN IF EXISTS "attendees_chat_id";

ALTER TABLE "Group" DROP COLUMN IF EXISTS "avatar_video_url";

-- 2. Restore Vote(post_id) index — declared in schema.prisma and in migration
--    20260303200000_add_perf_indexes, but missing from the live table (manually dropped
--    outside of migration history at some point). Used by rating-recalculation aggregates.
CREATE INDEX IF NOT EXISTS "Vote_post_id_idx" ON "Vote"("post_id");

-- 3. Drop indexes made redundant by an existing UNIQUE constraint on the same column.
DROP INDEX IF EXISTS "ActivityBlacklist_user_id_idx";
DROP INDEX IF EXISTS "RefreshToken_token_hash_idx";

-- 4. Add missing indexes on hot query paths.
CREATE INDEX IF NOT EXISTS "Post_author_id_idx" ON "Post"("author_id");
CREATE INDEX IF NOT EXISTS "Favourite_post_id_idx" ON "Favourite"("post_id");
