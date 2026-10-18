-- Рамки аватара живут только в магазине: убираем их лоты из Dealers' Den (мягкое удаление), рамки остаются
UPDATE "AvatarFrame" SET "listing_id" = NULL
WHERE "listing_id" IN (SELECT "id" FROM "DealerListing" WHERE "category" = 'avatar_frame');

UPDATE "DealerListing"
SET "deleted_at" = NOW(), "status" = 'archived'
WHERE "category" = 'avatar_frame' AND "deleted_at" IS NULL;
