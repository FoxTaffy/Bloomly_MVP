-- CreateTable: Album (профиль или группа) и AlbumItem (упорядоченные медиа)
CREATE TABLE "Album" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "group_id" UUID,
    "title" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500),
    "privacy" VARCHAR(10) NOT NULL DEFAULT 'public',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Album_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Album_owner_check" CHECK (("user_id" IS NOT NULL) <> ("group_id" IS NOT NULL))
);

CREATE TABLE "AlbumItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "album_id" UUID NOT NULL,
    "media_url" VARCHAR(1024) NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlbumItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Album_user_id_idx" ON "Album"("user_id");
CREATE INDEX "Album_group_id_idx" ON "Album"("group_id");
CREATE INDEX "AlbumItem_album_id_position_idx" ON "AlbumItem"("album_id", "position");

ALTER TABLE "Album" ADD CONSTRAINT "Album_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Album" ADD CONSTRAINT "Album_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AlbumItem" ADD CONSTRAINT "AlbumItem_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "Album"("id") ON DELETE CASCADE ON UPDATE CASCADE;
