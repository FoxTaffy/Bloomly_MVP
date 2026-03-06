-- Add warn_count, frozen_at, frozen_reason to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "warn_count"    INTEGER   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "frozen_at"     TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "frozen_reason" VARCHAR(500);

-- AutoModLog table
CREATE TABLE IF NOT EXISTS "AutoModLog" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id"    UUID         NOT NULL,
  "action"     VARCHAR(50)  NOT NULL,        -- warn | freeze | unfreeze | ban | flag_post | priority_boost
  "reason"     VARCHAR(300) NOT NULL,
  "category"   VARCHAR(50)  NOT NULL DEFAULT 'other',  -- spam | toxic | duplicate | fraud | suspicious
  "score"      FLOAT        NOT NULL DEFAULT 0,
  "details"    TEXT,
  "post_id"    UUID,
  "report_id"  UUID,
  "created_at" TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT "AutoModLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AutoModLog_user_id_idx"    ON "AutoModLog"("user_id");
CREATE INDEX IF NOT EXISTS "AutoModLog_created_at_idx" ON "AutoModLog"("created_at");
CREATE INDEX IF NOT EXISTS "AutoModLog_action_idx"     ON "AutoModLog"("action");

-- Add priority to Report (for AI sorting)
ALTER TABLE "Report"
  ADD COLUMN IF NOT EXISTS "priority"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ai_category" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "ai_score"    FLOAT;

CREATE INDEX IF NOT EXISTS "Report_priority_idx" ON "Report"("priority" DESC, "status");
