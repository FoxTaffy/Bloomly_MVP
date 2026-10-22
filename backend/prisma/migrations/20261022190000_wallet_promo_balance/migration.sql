-- Бонусный баланс кошелька (промо-BLM) и тип баланса в журнале. Только добавление: старые строки получают 0 и 'main'.
ALTER TABLE "Wallet" ADD COLUMN "promo_balance" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "WalletTransaction" ADD COLUMN "balance_type" VARCHAR(8) NOT NULL DEFAULT 'main';
