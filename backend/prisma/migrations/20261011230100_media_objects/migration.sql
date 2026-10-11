-- Владелец загруженного файла. owner_id NULL — объекты, загруженные до учёта владельцев.
-- CreateTable
CREATE TABLE "MediaObject" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "object_key" VARCHAR(255) NOT NULL,
    "owner_id" UUID,
    "folder" VARCHAR(40) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "MediaObject_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MediaObject_object_key_key" ON "MediaObject"("object_key");
CREATE INDEX "MediaObject_owner_id_idx" ON "MediaObject"("owner_id");
ALTER TABLE "MediaObject" ADD CONSTRAINT "MediaObject_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
