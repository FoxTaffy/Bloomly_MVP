-- Привязка способов оплаты через ЮKassa и автопродление подписки
ALTER TABLE "User" ADD COLUMN "subscription_auto_renew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "subscription_period" VARCHAR(10);
ALTER TABLE "User" ADD COLUMN "subscription_renew_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "subscription_next_renew_at" TIMESTAMP(3);

ALTER TABLE "PaymentMethod" ADD COLUMN "provider_method_id" VARCHAR(100);
ALTER TABLE "PaymentMethod" ADD COLUMN "type" VARCHAR(20) NOT NULL DEFAULT 'bank_card';
ALTER TABLE "PaymentMethod" ADD COLUMN "title" VARCHAR(100);
ALTER TABLE "PaymentMethod" ALTER COLUMN "last4" DROP NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "exp_month" DROP NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "exp_year" DROP NOT NULL;
ALTER TABLE "PaymentMethod" ALTER COLUMN "holder_name" DROP NOT NULL;
CREATE UNIQUE INDEX "PaymentMethod_provider_method_id_key" ON "PaymentMethod"("provider_method_id");

ALTER TABLE "Payment" ADD COLUMN "save_method" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Payment" ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT false;
