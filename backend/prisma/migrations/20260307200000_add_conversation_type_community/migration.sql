-- ── Step 1: Add 'type' column to Conversation ────────────────────────────────
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "type" VARCHAR(20) NOT NULL DEFAULT 'direct';

-- Backfill: is_group = true → type = 'group'
UPDATE "Conversation" SET "type" = 'group' WHERE "is_group" = true;

-- ── Step 2: Link Conversation → Group (for COMMUNITY chats) ─────────────────
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "group_id" UUID;
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_group_id_key" ON "Conversation"("group_id")
  WHERE "group_id" IS NOT NULL;
