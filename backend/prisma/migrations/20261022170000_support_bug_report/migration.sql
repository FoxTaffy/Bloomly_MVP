-- Структурированный баг-репорт в обращениях поддержки: шаги, ожидаемый результат, устройство и браузер.
ALTER TABLE "SupportTicket" ADD COLUMN "steps_to_reproduce" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "expected_result" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "device" VARCHAR(20);
ALTER TABLE "SupportTicket" ADD COLUMN "browser" VARCHAR(60);
