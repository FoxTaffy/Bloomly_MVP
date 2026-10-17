-- Журнал движения Bloom
CREATE TABLE "WalletTransaction" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "balance_after" DECIMAL(18,2) NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "ref_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletTransaction_user_id_created_at_idx" ON "WalletTransaction"("user_id", "created_at");
CREATE INDEX "WalletTransaction_kind_ref_id_idx" ON "WalletTransaction"("kind", "ref_id");

-- Один платёж не может зачислить Bloom дважды, даже при гонке или ошибке в коде
CREATE UNIQUE INDEX "WalletTransaction_topup_ref_key" ON "WalletTransaction"("ref_id") WHERE "kind" = 'topup';

-- Баланс не может уйти в минус. NOT VALID: старые строки не проверяются (миграция не упадёт на унаследованных данных),
-- а любое новое изменение баланса — проверяется.
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_balance_non_negative" CHECK ("balance" >= 0) NOT VALID;

-- Платёжные записи — финансовая история: пользователь с платежами не удаляется каскадом
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_user_id_fkey";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
