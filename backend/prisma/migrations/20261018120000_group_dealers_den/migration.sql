-- Привязка Dealers Den к группе: лоты создаются от имени группы «Творческая» или «Магазин».
ALTER TABLE "Group" ADD COLUMN "den_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN "den_agreed_at" TIMESTAMP(6);

ALTER TABLE "DealerListing" ADD COLUMN "group_id" UUID;
ALTER TABLE "DealerListing" ADD CONSTRAINT "DealerListing_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DealerListing_group_id_idx" ON "DealerListing"("group_id");

-- Продавцы, у которых уже есть лоты, не теряют доступ: подключаем их старейшую
-- подходящую группу и переносим на неё существующие лоты (согласие они дадут при следующем входе в настройки).
WITH sellers AS (
  SELECT DISTINCT seller_id FROM "DealerListing" WHERE deleted_at IS NULL
), pick AS (
  SELECT DISTINCT ON (g.owner_id) g.owner_id, g.id
  FROM "Group" g JOIN sellers s ON s.seller_id = g.owner_id
  WHERE g.type IN ('creative', 'shop') AND g.deleted_at IS NULL
  ORDER BY g.owner_id, (g.type = 'shop') DESC, g.created_at ASC
), enabled AS (
  UPDATE "Group" g SET den_enabled = true FROM pick WHERE g.id = pick.id RETURNING g.id, g.owner_id
)
UPDATE "DealerListing" l SET group_id = e.id FROM enabled e WHERE l.seller_id = e.owner_id AND l.group_id IS NULL;
