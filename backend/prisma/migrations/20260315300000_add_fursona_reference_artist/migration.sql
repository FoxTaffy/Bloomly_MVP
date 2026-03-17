-- Add reference artist info to Fursona
ALTER TABLE "Fursona"
  ADD COLUMN "reference_artist_name" VARCHAR(100),
  ADD COLUMN "reference_artist_url"  VARCHAR(500);
