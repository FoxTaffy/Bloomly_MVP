ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "reply_to_id" UUID REFERENCES "Message"(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "Message_reply_to_id_idx" ON "Message"("reply_to_id");
