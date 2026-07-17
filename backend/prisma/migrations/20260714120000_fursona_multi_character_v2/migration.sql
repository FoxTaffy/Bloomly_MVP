-- Fursona becomes 1:N with User (up to 10 characters per user, enforced in the service layer).
-- This redoes what 20260712090000_fursona_multi_character attempted, but this time schema.prisma,
-- the service/controller/routes layer, and the frontend all land in the same change set — the
-- earlier attempt only ran this half of the migration and left the app code on the 1:1 shape,
-- which is what forced 20260713171500/20260713173000 to revert it.
DROP INDEX "Fursona_user_id_key";

-- Primary/active character flag — the character shown in compact UI (profile header,
-- verification completeness). Every existing row today is a singleton, so
-- DEFAULT true correctly marks each one as its owner's primary with no extra backfill.
ALTER TABLE "Fursona" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT true;

-- FursonaReferenceImage becomes scoped to a specific Fursona instead of the whole account.
ALTER TABLE "FursonaReferenceImage" ADD COLUMN "fursona_id" UUID;

-- Edge case: a user may have reference images but never saved the Fursona form. Give them a
-- blank placeholder Fursona so no reference image is orphaned by the backfill below.
INSERT INTO "Fursona" (id, user_id, name, species, species_other, colors, likes_dislikes_visible, likes, dislikes, is_primary, created_at, updated_at)
SELECT gen_random_uuid(), ri.user_id, '', ARRAY[]::text[], NULL, ARRAY[]::text[], true, ARRAY[]::text[], ARRAY[]::text[], true, now(), now()
FROM "FursonaReferenceImage" ri
WHERE NOT EXISTS (SELECT 1 FROM "Fursona" f WHERE f.user_id = ri.user_id)
GROUP BY ri.user_id;

-- Backfill fursona_id from the user's (still-singular, at migration time) Fursona row.
UPDATE "FursonaReferenceImage" ri
SET "fursona_id" = f.id
FROM "Fursona" f
WHERE f.user_id = ri.user_id AND ri."fursona_id" IS NULL;

ALTER TABLE "FursonaReferenceImage" ALTER COLUMN "fursona_id" SET NOT NULL;

ALTER TABLE "FursonaReferenceImage"
  ADD CONSTRAINT "FursonaReferenceImage_fursona_id_fkey"
  FOREIGN KEY ("fursona_id") REFERENCES "Fursona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "FursonaReferenceImage_fursona_id_idx" ON "FursonaReferenceImage"("fursona_id");
