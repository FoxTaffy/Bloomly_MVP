-- Счётчик неверных попыток ввода OTP (защита от перебора кода)
ALTER TABLE "EmailOtp" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
