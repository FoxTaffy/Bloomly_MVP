-- Продвижение постов (бусты) убрано целиком.
DROP TABLE IF EXISTS "PostBoost";
DROP INDEX IF EXISTS "Post_boosted_until_idx";
ALTER TABLE "Post" DROP COLUMN IF EXISTS "boosted_at";
ALTER TABLE "Post" DROP COLUMN IF EXISTS "boosted_until";
