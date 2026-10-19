-- Счёт по заказу: выставляется при принятии заявки, оплату отмечает заказчик, подтверждает художник.
ALTER TABLE "Order" ADD COLUMN "payment_status" VARCHAR(12) NOT NULL DEFAULT 'none';
ALTER TABLE "Order" ADD COLUMN "invoice_amount" DECIMAL(12,2);
ALTER TABLE "Order" ADD COLUMN "invoice_currency" VARCHAR(10);
ALTER TABLE "Order" ADD COLUMN "invoice_message_id" UUID;
ALTER TABLE "Order" ADD COLUMN "paid_reported_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "payment_confirmed_at" TIMESTAMP(3);
