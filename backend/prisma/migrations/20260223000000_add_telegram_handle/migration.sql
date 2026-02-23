-- Add optional Telegram handle to User profile
ALTER TABLE "User" ADD COLUMN "telegram" VARCHAR(100);
