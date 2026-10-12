-- Защита входа: счётчики неверных попыток и временная блокировка, защита от повтора TOTP-кода,
-- признак бана (чтобы регистрация не освобождала email забаненного аккаунта).
ALTER TABLE "User"
  ADD COLUMN "totp_last_step" INTEGER,
  ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failed_2fa_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "login_locked_until" TIMESTAMP(3),
  ADD COLUMN "is_banned" BOOLEAN NOT NULL DEFAULT false;

-- Аккаунты, забаненные автомодерацией, помечаем сразу (у них есть маркер в frozen_reason).
UPDATE "User" SET "is_banned" = true
WHERE "deleted_at" IS NOT NULL AND "frozen_reason" LIKE '[AUTOMOD BAN]%';
