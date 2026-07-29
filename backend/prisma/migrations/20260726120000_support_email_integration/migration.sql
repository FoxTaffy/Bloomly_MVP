-- Support inbox <-> bloomly_support@pm.me two-way email integration.
-- Tickets can now originate from (and be replied to via) real email, so a ticket
-- becomes a thread of SupportTicketMessage rows instead of a single message+admin_reply pair.

-- AlterTable: user_id becomes optional (inbound emails may not map to a Bloomly account)
ALTER TABLE "SupportTicket" DROP CONSTRAINT IF EXISTS "SupportTicket_user_id_fkey";
ALTER TABLE "SupportTicket" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: new columns for email origin/threading
ALTER TABLE "SupportTicket"
  ADD COLUMN "source" VARCHAR(10) NOT NULL DEFAULT 'app',
  ADD COLUMN "external_email" VARCHAR(255),
  ADD COLUMN "email_message_id" VARCHAR(255);

-- CreateTable: SupportTicketMessage (the thread; replaces message/admin_reply columns)
CREATE TABLE IF NOT EXISTS "SupportTicketMessage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "sender_type" VARCHAR(10) NOT NULL,
    "sender_user_id" UUID,
    "body" TEXT NOT NULL,
    "email_message_id" VARCHAR(255),
    "attachment_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportTicketMessage_ticket_id_idx" ON "SupportTicketMessage"("ticket_id");

ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicketMessage" ADD CONSTRAINT "SupportTicketMessage_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: the original ticket message becomes the first "user" message in the thread.
-- (user_id may be null going forward, but every pre-existing ticket had one.)
INSERT INTO "SupportTicketMessage" ("id", "ticket_id", "sender_type", "sender_user_id", "body", "attachment_urls", "created_at")
SELECT gen_random_uuid(), "id", 'user', "user_id", "message", "attachment_urls", "created_at"
FROM "SupportTicket";

-- Backfill: any existing admin_reply becomes the second "admin" message in the thread.
INSERT INTO "SupportTicketMessage" ("id", "ticket_id", "sender_type", "sender_user_id", "body", "created_at")
SELECT gen_random_uuid(), "id", 'admin', "replied_by", "admin_reply", COALESCE("replied_at", "updated_at")
FROM "SupportTicket"
WHERE "admin_reply" IS NOT NULL;

-- AlterTable: drop now-superseded single-message/single-reply columns
ALTER TABLE "SupportTicket" DROP CONSTRAINT IF EXISTS "SupportTicket_replied_by_fkey";
ALTER TABLE "SupportTicket"
  DROP COLUMN "message",
  DROP COLUMN "admin_reply",
  DROP COLUMN "replied_by",
  DROP COLUMN "replied_at",
  DROP COLUMN "attachment_urls";
