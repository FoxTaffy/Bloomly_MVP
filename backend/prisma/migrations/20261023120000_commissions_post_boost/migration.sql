-- Плашка «Заказы открыты» и бусты постов в ленту. Только добавление.
ALTER TABLE "User" ADD COLUMN "commissions_status" VARCHAR(10) NOT NULL DEFAULT 'none';

ALTER TABLE "Post" ADD COLUMN "boosted_at" TIMESTAMP(3);
ALTER TABLE "Post" ADD COLUMN "boosted_until" TIMESTAMP(3);
CREATE INDEX "Post_boosted_until_idx" ON "Post"("boosted_until");

CREATE TABLE "PostBoost" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "post_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" VARCHAR(10) NOT NULL,
  "cost_blm" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostBoost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostBoost_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PostBoost_user_id_kind_created_at_idx" ON "PostBoost"("user_id", "kind", "created_at");
CREATE INDEX "PostBoost_post_id_created_at_idx" ON "PostBoost"("post_id", "created_at");
