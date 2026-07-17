-- CreateTable: SupportTicket
CREATE TABLE IF NOT EXISTS "SupportTicket" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'question',
    "subject" VARCHAR(150) NOT NULL,
    "message" VARCHAR(3000) NOT NULL,
    "contact_email" VARCHAR(255),
    "attachment_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "admin_reply" VARCHAR(3000),
    "replied_by" UUID,
    "replied_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SupportTicket_user_id_idx" ON "SupportTicket"("user_id");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx" ON "SupportTicket"("status");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_replied_by_fkey" FOREIGN KEY ("replied_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
