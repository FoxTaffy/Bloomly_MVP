-- Add is_verified and category to Group
ALTER TABLE "Group" ADD COLUMN "is_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "category" VARCHAR(50);

-- Create EventAttendee table (RSVP)
CREATE TABLE "EventAttendee" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "event_id"     UUID        NOT NULL,
  "user_id"      UUID        NOT NULL,
  "status"       VARCHAR(20) NOT NULL DEFAULT 'going',
  "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventAttendee_event_id_user_id_key" ON "EventAttendee"("event_id", "user_id");
CREATE INDEX "EventAttendee_event_id_idx"  ON "EventAttendee"("event_id");
CREATE INDEX "EventAttendee_user_id_idx"   ON "EventAttendee"("user_id");

ALTER TABLE "EventAttendee"
  ADD CONSTRAINT "EventAttendee_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventAttendee"
  ADD CONSTRAINT "EventAttendee_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
