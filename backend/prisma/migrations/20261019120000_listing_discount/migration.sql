-- Скидка на карточку Dealers' Den (в процентах; price хранит цену без скидки).
ALTER TABLE "DealerListing" ADD COLUMN "discount_percent" INTEGER NOT NULL DEFAULT 0;
