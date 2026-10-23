ALTER TABLE "User" ADD COLUMN "bugs_confirmed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupportTicket" ADD COLUMN "bug_rewarded_at" TIMESTAMP(3);
