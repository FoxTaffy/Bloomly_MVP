-- The 20260712090000_fursona_multi_character migration dropped this unique index
-- as a first step toward multi-character support, but that feature was never
-- finished elsewhere (schema.prisma, service.ts and the routes are all still
-- 1:1 per user). Restore it so prisma.fursona.upsert()'s ON CONFLICT target exists again.
CREATE UNIQUE INDEX "Fursona_user_id_key" ON "Fursona"("user_id");
