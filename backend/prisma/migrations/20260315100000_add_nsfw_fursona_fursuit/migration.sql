-- Add NSFW flag to Fursona (reference sheet)
ALTER TABLE "Fursona" ADD COLUMN "reference_is_nsfw" BOOLEAN NOT NULL DEFAULT false;

-- Add NSFW flag to Fursuit (photo / reference)
ALTER TABLE "Fursuit" ADD COLUMN "is_nsfw" BOOLEAN NOT NULL DEFAULT false;
