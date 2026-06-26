-- E2EE messages: ConversationKey table, encrypted_text + forwarded_from on Message

CREATE TABLE IF NOT EXISTS "ConversationKey" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID        NOT NULL,
  "user_id"         UUID        NOT NULL,
  "encrypted_key"   TEXT        NOT NULL,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversationKey_conversation_id_user_id_key" UNIQUE ("conversation_id", "user_id"),
  CONSTRAINT "ConversationKey_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id") ON DELETE CASCADE,
  CONSTRAINT "ConversationKey_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ConversationKey_user_id_idx" ON "ConversationKey"("user_id");

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "encrypted_text"          TEXT,
  ADD COLUMN IF NOT EXISTS "forwarded_from_id"        UUID,
  ADD COLUMN IF NOT EXISTS "forwarded_from_sender_id" UUID,
  ADD COLUMN IF NOT EXISTS "forwarded_from_conv_id"   UUID;
