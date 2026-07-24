-- AlterTable
ALTER TABLE "Report"
  ADD COLUMN "evidence_urls" TEXT[] DEFAULT ARRAY[]::TEXT[];
