-- Add pinned_message_id to Conversation (pin for all participants)
ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "pinned_message_id" UUID REFERENCES "Message"("id") ON DELETE SET NULL;

-- Add personal_pinned_message_id to ConversationParticipant (pin only for me)
ALTER TABLE "ConversationParticipant"
  ADD COLUMN IF NOT EXISTS "personal_pinned_message_id" UUID REFERENCES "Message"("id") ON DELETE SET NULL;
