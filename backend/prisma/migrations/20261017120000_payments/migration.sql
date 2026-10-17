-- Платежи (ЮMoney / с баланса) и срок оплаченной подписки
ALTER TABLE "User" ADD COLUMN "subscription_expires_at" TIMESTAMP(3);

CREATE TABLE "Payment" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"               UUID NOT NULL,
    "provider"              VARCHAR(20) NOT NULL,
    "purpose"               VARCHAR(20) NOT NULL,
    "status"                VARCHAR(20) NOT NULL DEFAULT 'pending',
    "amount"                DECIMAL(18,2) NOT NULL,
    "credited_amount"       DECIMAL(18,2),
    "currency"              VARCHAR(3) NOT NULL DEFAULT 'RUB',
    "method"                VARCHAR(10),
    "tier"                  VARCHAR(20),
    "period"                VARCHAR(10),
    "provider_operation_id" VARCHAR(100),
    "failure_reason"        VARCHAR(200),
    "raw_notification"      JSONB,
    "paid_at"               TIMESTAMP(3),
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Payment_provider_operation_id_key" ON "Payment"("provider_operation_id");
CREATE INDEX "Payment_user_id_created_at_idx" ON "Payment"("user_id", "created_at");
CREATE INDEX "Payment_status_created_at_idx" ON "Payment"("status", "created_at");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
