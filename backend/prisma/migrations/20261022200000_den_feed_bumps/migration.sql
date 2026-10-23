-- Общая лента Dealers Den: кулдаун публикации и поднятия карточек.
ALTER TABLE "DealerListing" ADD COLUMN "feed_published_at" TIMESTAMP(6);
ALTER TABLE "DealerListing" ADD COLUMN "feed_at" TIMESTAMP(6);
ALTER TABLE "DealerListing" ADD COLUMN "last_bumped_at" TIMESTAMP(6);
ALTER TABLE "DealerListing" ADD COLUMN "auto_bump" BOOLEAN NOT NULL DEFAULT false;

-- Уже существующие карточки остаются в ленте на своих местах; черновики попадут в ленту при публикации.
UPDATE "DealerListing" SET "feed_published_at" = "created_at", "feed_at" = "created_at" WHERE "status" <> 'draft';

CREATE INDEX "DealerListing_feed_at_idx" ON "DealerListing"("feed_at" DESC);

CREATE TABLE "DenBump" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "listing_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "group_id" UUID,
  "kind" VARCHAR(10) NOT NULL,
  "cost_blm" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DenBump_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DenBump_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DenBump_user_id_kind_created_at_idx" ON "DenBump"("user_id", "kind", "created_at");
CREATE INDEX "DenBump_group_id_kind_created_at_idx" ON "DenBump"("group_id", "kind", "created_at");
CREATE INDEX "DenBump_listing_id_idx" ON "DenBump"("listing_id");
