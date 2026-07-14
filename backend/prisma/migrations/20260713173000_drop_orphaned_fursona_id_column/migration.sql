-- The 20260712090000_fursona_multi_character migration added a NOT NULL
-- fursona_id column (with FK to Fursona.id) to FursonaReferenceImage as part
-- of an abandoned multi-character rework. schema.prisma was never updated to
-- declare this field and no code anywhere reads or writes it, so every
-- fursonaReferenceImage.create() has been failing NOT NULL. Drop it — the
-- gallery stays keyed by user_id only, matching schema.prisma and the service layer.
ALTER TABLE "FursonaReferenceImage" DROP CONSTRAINT "FursonaReferenceImage_fursona_id_fkey";
DROP INDEX "FursonaReferenceImage_fursona_id_idx";
ALTER TABLE "FursonaReferenceImage" DROP COLUMN "fursona_id";
