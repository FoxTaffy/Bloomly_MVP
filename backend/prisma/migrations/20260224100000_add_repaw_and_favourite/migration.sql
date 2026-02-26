-- CreateTable Repaw (repost like TikTok/Twitter)
CREATE TABLE "Repaw" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID         NOT NULL,
  "post_id"    UUID         NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Repaw_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Repaw"
  ADD CONSTRAINT "Repaw_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Repaw"
  ADD CONSTRAINT "Repaw_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Repaw_user_id_post_id_key" ON "Repaw"("user_id", "post_id");

-- CreateTable Favourite (bookmarks)
CREATE TABLE "Favourite" (
  "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID         NOT NULL,
  "post_id"    UUID         NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favourite_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Favourite"
  ADD CONSTRAINT "Favourite_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Favourite"
  ADD CONSTRAINT "Favourite_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Favourite_user_id_post_id_key" ON "Favourite"("user_id", "post_id");
