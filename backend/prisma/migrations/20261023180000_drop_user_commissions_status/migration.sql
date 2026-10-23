-- Плашка «Заказы открыты» переехала из профиля в творческие группы (CommissionInfo.status)
ALTER TABLE "User" DROP COLUMN IF EXISTS "commissions_status";
