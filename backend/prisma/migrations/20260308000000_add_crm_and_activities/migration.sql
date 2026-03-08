-- ── BLOCK 1: CRM label on ConversationParticipant ────────────────────────────
ALTER TABLE "ConversationParticipant"
  ADD COLUMN "label" VARCHAR(20) NOT NULL DEFAULT 'default';

-- ── BLOCK 2: Activity Engine ──────────────────────────────────────────────────

CREATE TABLE "Activity" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "type"             VARCHAR(30) NOT NULL,        -- collab | secret_santa | broken_tablet
  "owner_id"         UUID        NOT NULL,
  "group_id"         UUID,
  "title"            VARCHAR(200) NOT NULL,
  "description"      TEXT,
  "deadline"         TIMESTAMP(6),
  "max_participants" INTEGER,
  "status"           VARCHAR(20) NOT NULL DEFAULT 'active', -- draft | active | completed | cancelled
  "created_at"       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"       TIMESTAMP(6),

  CONSTRAINT "Activity_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Activity_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "Activity_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL
);

CREATE INDEX "Activity_owner_id_idx" ON "Activity"("owner_id");
CREATE INDEX "Activity_group_id_idx" ON "Activity"("group_id");
CREATE INDEX "Activity_status_idx"   ON "Activity"("status");

-- ── ActivityParticipant ───────────────────────────────────────────────────────

CREATE TABLE "ActivityParticipant" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "activity_id"      UUID        NOT NULL,
  "user_id"          UUID        NOT NULL,
  "status"           VARCHAR(20) NOT NULL DEFAULT 'pending',
              -- pending | approved | submitted | completed | withdrawn | delayed | fraud
  "withdraw_deadline" TIMESTAMP(6),  -- 3 days after activity.created_at
  "submitted_at"     TIMESTAMP(6),
  "notes"            TEXT,
  "created_at"       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"       TIMESTAMP(6),

  CONSTRAINT "ActivityParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ActivityParticipant_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "Activity"("id") ON DELETE CASCADE,
  CONSTRAINT "ActivityParticipant_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ActivityParticipant_activity_id_user_id_key" UNIQUE ("activity_id", "user_id")
);

CREATE INDEX "ActivityParticipant_user_id_idx"          ON "ActivityParticipant"("user_id");
CREATE INDEX "ActivityParticipant_activity_status_idx"  ON "ActivityParticipant"("activity_id", "status");

-- ── ActivityBlacklist ─────────────────────────────────────────────────────────

CREATE TABLE "ActivityBlacklist" (
  "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
  "user_id"   UUID        NOT NULL,
  "reason"    VARCHAR(500) NOT NULL,
  "banned_by" UUID,         -- NULL = auto-ban by cron
  "banned_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(6),

  CONSTRAINT "ActivityBlacklist_pkey"    PRIMARY KEY ("id"),
  CONSTRAINT "ActivityBlacklist_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "ActivityBlacklist_user_id_fkey"   FOREIGN KEY ("user_id")   REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "ActivityBlacklist_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX "ActivityBlacklist_user_id_idx" ON "ActivityBlacklist"("user_id");
