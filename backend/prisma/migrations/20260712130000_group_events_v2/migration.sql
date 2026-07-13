-- AlterTable: Group gets an optional animated-avatar WebM, mirrors User.avatar_video_url
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "avatar_video_url" TEXT;

-- AlterTable: Event gains RSVP-approval workflow config + attendees chat link
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "requires_approval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "payment_deadline_hours" INTEGER;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "location_visibility" VARCHAR(20) NOT NULL DEFAULT 'public';
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "unlock_chat_on_approval" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "attendees_chat_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "Event_attendees_chat_id_key" ON "Event"("attendees_chat_id");

ALTER TABLE "Event" ADD CONSTRAINT "Event_attendees_chat_id_fkey" FOREIGN KEY ("attendees_chat_id") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: EventAttendee gains the RSVP-approval application fields
ALTER TABLE "EventAttendee" ADD COLUMN IF NOT EXISTS "ticket_tier_id" UUID;
ALTER TABLE "EventAttendee" ADD COLUMN IF NOT EXISTS "payment_deadline_at" TIMESTAMP(3);
ALTER TABLE "EventAttendee" ADD COLUMN IF NOT EXISTS "decided_at" TIMESTAMP(3);
ALTER TABLE "EventAttendee" ADD COLUMN IF NOT EXISTS "decided_by" UUID;

ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_ticket_tier_id_fkey" FOREIGN KEY ("ticket_tier_id") REFERENCES "TicketTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
