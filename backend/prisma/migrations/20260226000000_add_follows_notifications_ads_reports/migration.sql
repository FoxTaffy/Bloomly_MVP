-- Follow system
CREATE TABLE "Follow" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "follower_id"  UUID NOT NULL,
    "following_id" UUID NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Follow_follower_id_following_id_key" UNIQUE ("follower_id", "following_id")
);
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_follower_id_fkey"  FOREIGN KEY ("follower_id")  REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Follow_follower_id_idx"  ON "Follow"("follower_id");
CREATE INDEX "Follow_following_id_idx" ON "Follow"("following_id");

-- Notification system
CREATE TABLE "Notification" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "receiver_id" UUID NOT NULL,
    "sender_id"   UUID,
    "type"        TEXT NOT NULL, -- FOLLOW | LIKE | COMMENT | REPAW | MENTION
    "post_id"     UUID,
    "comment_id"  UUID,
    "read"        BOOLEAN NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sender_id_fkey"   FOREIGN KEY ("sender_id")   REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Notification_receiver_id_idx"       ON "Notification"("receiver_id");
CREATE INDEX "Notification_receiver_read_idx"     ON "Notification"("receiver_id", "read");

-- Advertisement system
CREATE TABLE "Advertisement" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "title"        TEXT NOT NULL,
    "description"  TEXT,
    "image_url"    TEXT,
    "link_url"     TEXT NOT NULL,
    "contact_info" TEXT,
    "status"       TEXT NOT NULL DEFAULT 'pending', -- pending | active | rejected
    "requester_id" UUID,
    "reviewed_by"  UUID,
    "impressions"  INTEGER NOT NULL DEFAULT 0,
    "clicks"       INTEGER NOT NULL DEFAULT 0,
    "starts_at"    TIMESTAMP(3),
    "ends_at"      TIMESTAMP(3),
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Advertisement_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_reviewed_by_fkey"  FOREIGN KEY ("reviewed_by")  REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Report system
CREATE TABLE "Report" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_id" UUID NOT NULL,
    "target_type" TEXT NOT NULL, -- post | comment | user
    "target_id"   UUID NOT NULL,
    "reason"      TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending', -- pending | reviewed | dismissed
    "resolved_by" UUID,
    "note"        TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- User profile extensions
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "website"    TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "location"   TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pronouns"   TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "badge_type" TEXT; -- admin | moderator | creator | verified
