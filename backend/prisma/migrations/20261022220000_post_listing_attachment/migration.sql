-- Прикреплённый лот Dealers' Den у поста. Колонка необязательная: старые посты не меняются,
-- при удалении лота ссылка просто обнуляется.
ALTER TABLE "Post" ADD COLUMN "listing_id" UUID;

CREATE INDEX "Post_listing_id_idx" ON "Post"("listing_id");

ALTER TABLE "Post" ADD CONSTRAINT "Post_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
