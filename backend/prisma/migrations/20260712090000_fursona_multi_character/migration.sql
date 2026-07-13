-- Fursona becomes 1:N with User (up to 10 characters per user, enforced in the service layer)
DROP INDEX IF EXISTS "Fursona_user_id_key";

-- FursonaReferenceImage becomes 1:N with Fursona instead of shared account-wide
ALTER TABLE "FursonaReferenceImage" ADD COLUMN IF NOT EXISTS "fursona_id" UUID;

-- Ensure every user who already has reference images but no Fursona row gets one,
-- so no existing reference image is orphaned by the backfill below.
INSERT INTO "Fursona" (id, user_id, name, species, species_other, colors, likes_dislikes_visible, likes, dislikes, created_at, updated_at)
SELECT gen_random_uuid(), ri.user_id, '', ARRAY[]::text[], NULL, ARRAY[]::text[], true, ARRAY[]::text[], ARRAY[]::text[], now(), now()
FROM "FursonaReferenceImage" ri
WHERE ri."fursona_id" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Fursona" f WHERE f.user_id = ri.user_id)
GROUP BY ri.user_id;

-- Backfill fursona_id from the user's existing Fursona row (their sole/first character)
UPDATE "FursonaReferenceImage" ri
SET "fursona_id" = f.id
FROM "Fursona" f
WHERE f.user_id = ri.user_id AND ri."fursona_id" IS NULL;

ALTER TABLE "FursonaReferenceImage" ALTER COLUMN "fursona_id" SET NOT NULL;

ALTER TABLE "FursonaReferenceImage"
  ADD CONSTRAINT "FursonaReferenceImage_fursona_id_fkey"
  FOREIGN KEY ("fursona_id") REFERENCES "Fursona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "FursonaReferenceImage_fursona_id_idx" ON "FursonaReferenceImage"("fursona_id");
