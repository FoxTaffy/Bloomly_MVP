-- Персонажи в заявке на лот и связь принятой заявки с заказом в очереди группы.
ALTER TABLE "ListingApplication" ADD COLUMN "characters" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "ListingApplication" ADD COLUMN "order_id" UUID;
