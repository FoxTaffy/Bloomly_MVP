-- Курс BLM: 1 BLM = 1 $, рублёвый эквивалент берётся из курса ЦБ и обновляется 2 раза в сутки
CREATE TABLE "BlmRate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usd_rub" DECIMAL(10,4) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'cbr',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlmRate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BlmRate_created_at_idx" ON "BlmRate"("created_at");

-- BLM и курс фиксируются в платеже в момент создания (пополнение, оплата подписки с баланса)
ALTER TABLE "Payment" ADD COLUMN "blm_amount" DECIMAL(18,2);
ALTER TABLE "Payment" ADD COLUMN "blm_rate" DECIMAL(10,4);
