-- Группа может отключить заказы через безопасную сделку: у её лотов и заказов показывается предупреждение
ALTER TABLE "Group" ADD COLUMN "safe_deals_enabled" BOOLEAN NOT NULL DEFAULT true;
