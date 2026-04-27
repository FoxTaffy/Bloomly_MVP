-- Add reactions JSON and edited_at to Message
ALTER TABLE "Message"
  ADD COLUMN "reactions" JSONB,
  ADD COLUMN "edited_at" TIMESTAMP(3);
