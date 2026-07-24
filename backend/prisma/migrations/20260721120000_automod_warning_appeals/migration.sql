-- AlterTable
ALTER TABLE "AutoModLog"
  ADD COLUMN "image_url" TEXT,
  ADD COLUMN "appeal_status" VARCHAR(20) NOT NULL DEFAULT 'none',
  ADD COLUMN "appeal_text" TEXT,
  ADD COLUMN "appeal_created_at" TIMESTAMP(3),
  ADD COLUMN "appeal_resolved_at" TIMESTAMP(3),
  ADD COLUMN "appeal_resolved_by" UUID;

-- CreateIndex
CREATE INDEX "AutoModLog_appeal_status_idx" ON "AutoModLog"("appeal_status");
