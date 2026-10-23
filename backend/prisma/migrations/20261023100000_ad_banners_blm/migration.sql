-- Реклама за BLM: место размещения, срок, цена со скидкой тарифа и разбивка списания (для возврата при отказе).
-- Только добавление: старые заявки остаются без места и оплаты и показываются как раньше.
ALTER TABLE "Advertisement" ADD COLUMN "placement" VARCHAR(20);
ALTER TABLE "Advertisement" ADD COLUMN "billing" VARCHAR(5);
ALTER TABLE "Advertisement" ADD COLUMN "periods" INTEGER;
ALTER TABLE "Advertisement" ADD COLUMN "duration_days" INTEGER;
ALTER TABLE "Advertisement" ADD COLUMN "price_blm" DECIMAL(18,2);
ALTER TABLE "Advertisement" ADD COLUMN "discount_pct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Advertisement" ADD COLUMN "paid_main_blm" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Advertisement" ADD COLUMN "paid_promo_blm" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "Advertisement" ADD COLUMN "refunded_at" TIMESTAMP(3);
