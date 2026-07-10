-- CreateTable: FursonaReferenceImage (multi-image reference gallery, replaces single reference_image_url)
CREATE TABLE IF NOT EXISTS "FursonaReferenceImage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "is_nsfw" BOOLEAN NOT NULL DEFAULT false,
    "artist_name" VARCHAR(100),
    "artist_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "FursonaReferenceImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FursonaReferenceImage_user_id_idx" ON "FursonaReferenceImage"("user_id");

ALTER TABLE "FursonaReferenceImage" ADD CONSTRAINT "FursonaReferenceImage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: carry over the single existing reference image (if any) into the new gallery table
INSERT INTO "FursonaReferenceImage" ("id", "user_id", "image_url", "is_nsfw", "artist_name", "artist_url", "created_at", "updated_at")
SELECT gen_random_uuid(), "user_id", "reference_image_url", "reference_is_nsfw", "reference_artist_name", "reference_artist_url", now(), now()
FROM "Fursona"
WHERE "reference_image_url" IS NOT NULL;

-- AlterTable: drop the now-superseded single-reference columns from Fursona
ALTER TABLE "Fursona" DROP COLUMN IF EXISTS "reference_image_url";
ALTER TABLE "Fursona" DROP COLUMN IF EXISTS "reference_is_nsfw";
ALTER TABLE "Fursona" DROP COLUMN IF EXISTS "reference_artist_name";
ALTER TABLE "Fursona" DROP COLUMN IF EXISTS "reference_artist_url";
