-- Small structured payload for system notifications (e.g. AutoMod warn count/reason).
ALTER TABLE "Notification" ADD COLUMN "meta" JSONB;
