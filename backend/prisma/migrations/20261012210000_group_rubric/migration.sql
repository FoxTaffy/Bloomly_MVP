-- Group rubric (news / brand sub-category chosen at creation). Kept apart from "category".
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "rubric" VARCHAR(50);
