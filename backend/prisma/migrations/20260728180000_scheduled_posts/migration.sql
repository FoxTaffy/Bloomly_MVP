-- CreateTable
CREATE TABLE "ScheduledPost" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "group_id" UUID,
    "content" TEXT NOT NULL,
    "media_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "media_original_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_nsfw" BOOLEAN NOT NULL DEFAULT false,
    "is_ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    "scheduled_at" TIMESTAMP(3),
    "timezone" VARCHAR(64),
    "repeat_interval" VARCHAR(20),
    "repeat_until" TIMESTAMP(3),
    "occurrences_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "published_post_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledPost_status_scheduled_at_idx" ON "ScheduledPost"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "ScheduledPost_author_id_idx" ON "ScheduledPost"("author_id");

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPost" ADD CONSTRAINT "ScheduledPost_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
