-- AlterTable: Story gets an optional video_url alongside image_url
ALTER TABLE "Story" ADD COLUMN IF NOT EXISTS "video_url" TEXT;

-- CreateTable: StoryView (who watched which story)
CREATE TABLE IF NOT EXISTS "StoryView" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "story_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoryView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoryView_story_id_user_id_key" ON "StoryView"("story_id", "user_id");
CREATE INDEX IF NOT EXISTS "StoryView_story_id_idx" ON "StoryView"("story_id");

ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryView" ADD CONSTRAINT "StoryView_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: StoryVote (persisted thumbs up/down, replaces client-only localStorage votes)
CREATE TABLE IF NOT EXISTS "StoryVote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "story_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "value" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoryVote_story_id_user_id_key" ON "StoryVote"("story_id", "user_id");
CREATE INDEX IF NOT EXISTS "StoryVote_story_id_idx" ON "StoryVote"("story_id");

ALTER TABLE "StoryVote" ADD CONSTRAINT "StoryVote_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryVote" ADD CONSTRAINT "StoryVote_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
