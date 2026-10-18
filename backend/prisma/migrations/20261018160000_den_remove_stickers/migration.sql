-- Стикеры живут только в магазине: убираем лоты категории sticker из Dealers' Den (мягкое удаление)
UPDATE "DealerListing"
SET "deleted_at" = NOW(), "status" = 'archived'
WHERE "category" = 'sticker' AND "deleted_at" IS NULL;
