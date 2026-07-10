-- AlterTable: region used to pick alternative payment methods when the user has no saved card
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "payment_region" VARCHAR(10);

-- CreateTable: PaymentMethod (masked card info only — never store PAN/CVV)
CREATE TABLE IF NOT EXISTS "PaymentMethod" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "brand" VARCHAR(20) NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "exp_month" INTEGER NOT NULL,
    "exp_year" INTEGER NOT NULL,
    "holder_name" VARCHAR(60) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaymentMethod_user_id_idx" ON "PaymentMethod"("user_id");

ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
