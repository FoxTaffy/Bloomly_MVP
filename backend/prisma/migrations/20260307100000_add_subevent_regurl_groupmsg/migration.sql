-- Add registration_url to Event
ALTER TABLE "Event" ADD COLUMN "registration_url" VARCHAR(500);

-- SubEvent (nested panels/workshops within an Event)
CREATE TABLE "SubEvent" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "event_id"      UUID         NOT NULL,
  "title"         VARCHAR(200) NOT NULL,
  "type"          VARCHAR(50)  NOT NULL DEFAULT 'panel',
  "speaker"       VARCHAR(200),
  "location_name" VARCHAR(200),
  "starts_at"     TIMESTAMP(3) NOT NULL,
  "ends_at"       TIMESTAMP(3),
  "description"   TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SubEvent_event_id_idx"  ON "SubEvent"("event_id");
CREATE INDEX "SubEvent_starts_at_idx" ON "SubEvent"("starts_at");
ALTER TABLE "SubEvent"
  ADD CONSTRAINT "SubEvent_event_id_fkey"
  FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- GroupMessage (realtime group chat)
CREATE TABLE "GroupMessage" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "group_id"   UUID         NOT NULL,
  "user_id"    UUID         NOT NULL,
  "text"       TEXT         NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "GroupMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GroupMessage_group_id_idx" ON "GroupMessage"("group_id", "created_at" DESC);
CREATE INDEX "GroupMessage_user_id_idx"  ON "GroupMessage"("user_id");
ALTER TABLE "GroupMessage"
  ADD CONSTRAINT "GroupMessage_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMessage"
  ADD CONSTRAINT "GroupMessage_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
