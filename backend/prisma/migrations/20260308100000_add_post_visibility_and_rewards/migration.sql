-- Add visibility and reward fields to Post
ALTER TABLE "Post"
  ADD COLUMN IF NOT EXISTS "subscriber_only" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "is_paid"         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "price"           DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS "reward_for_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "video_title"     VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "video_description" TEXT;

-- FK for reward_for_user
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Post_reward_for_user_id_fkey'
  ) THEN
    ALTER TABLE "Post" ADD CONSTRAINT "Post_reward_for_user_id_fkey"
    FOREIGN KEY ("reward_for_user_id") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
