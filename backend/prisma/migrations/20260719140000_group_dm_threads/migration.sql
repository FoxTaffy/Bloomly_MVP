-- Replace the single shared "community chat" (one Conversation per group, everyone in one room)
-- with a personal 1:1-style thread per member ("написать сообществу"). Any group admin/owner
-- can reply in a member's thread; the reply is rendered client-side as coming from the group.

-- Step 1: drop the old uniqueness that forced exactly one Conversation per group.
DROP INDEX IF EXISTS "Conversation_group_id_key";

-- Step 2: add the column identifying whose personal thread with the group this is.
ALTER TABLE "Conversation" ADD COLUMN "group_dm_user_id" UUID;
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_group_dm_user_id_fkey"
  FOREIGN KEY ("group_dm_user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Conversation_group_id_idx" ON "Conversation"("group_id");
CREATE UNIQUE INDEX "Conversation_group_id_group_dm_user_id_key" ON "Conversation"("group_id", "group_dm_user_id");

-- Step 3: hide the old shared group rooms from everyone's conversation list. History is kept
-- (nothing deleted), just no longer surfaced — the personal-thread model replaces them going forward.
UPDATE "ConversationParticipant" cp
SET hidden_at = now()
FROM "Conversation" c
WHERE cp.conversation_id = c.id
  AND c.type = 'community'
  AND c.group_dm_user_id IS NULL
  AND cp.hidden_at IS NULL;
