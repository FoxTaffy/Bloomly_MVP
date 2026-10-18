-- Какие системные (push) уведомления присылать: сообщения и события
ALTER TABLE "User" ADD COLUMN "push_messages" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "push_events" BOOLEAN NOT NULL DEFAULT true;
