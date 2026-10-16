-- Статус «Спонсор» — выдаётся из админ-панели
ALTER TABLE "User" ADD COLUMN "is_sponsor" BOOLEAN NOT NULL DEFAULT false;
