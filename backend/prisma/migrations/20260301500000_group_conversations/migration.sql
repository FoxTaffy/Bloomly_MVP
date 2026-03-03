-- Add group conversation support
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "is_group" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "name" VARCHAR(100);
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;
ALTER TABLE "ConversationParticipant" ADD COLUMN IF NOT EXISTS "role" VARCHAR(20) NOT NULL DEFAULT 'member';
