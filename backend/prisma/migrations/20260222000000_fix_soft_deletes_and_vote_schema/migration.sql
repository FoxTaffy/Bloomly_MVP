-- Add soft-delete column to Post
ALTER TABLE "Post" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Add soft-delete column to Wallet
ALTER TABLE "Wallet" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- Drop the old Vote table (composite primary key, no timestamps, wrong structure)
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_post_id_fkey";
ALTER TABLE "Vote" DROP CONSTRAINT "Vote_user_id_fkey";
DROP TABLE "Vote";

-- Recreate Vote with full architectural compliance:
--   • UUID primary key
--   • created_at / updated_at / deleted_at
--   • unique constraint on (user_id, post_id) — one record per user+post pair
CREATE TABLE "Vote" (
    "id"         UUID         NOT NULL,
    "user_id"    UUID         NOT NULL,
    "post_id"    UUID         NOT NULL,
    "value"      INTEGER      NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- Unique index: one vote record per user per post (soft-deleted records are included,
-- restoring a deleted record reactivates the vote instead of inserting a duplicate)
CREATE UNIQUE INDEX "Vote_user_id_post_id_key" ON "Vote"("user_id", "post_id");

-- Restore foreign-key constraints
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Vote" ADD CONSTRAINT "Vote_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
