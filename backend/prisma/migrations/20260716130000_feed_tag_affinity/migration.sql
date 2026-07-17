-- AlterTable
ALTER TABLE "Vote" ADD COLUMN "term_deltas" JSONB;

-- AlterTable
ALTER TABLE "Repaw" ADD COLUMN "term_deltas" JSONB;

-- CreateTable
CREATE TABLE "UserTagAffinity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "term" VARCHAR(60) NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'tag',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "dislikes" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTagAffinity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserTagAffinity_user_id_score_idx" ON "UserTagAffinity"("user_id", "score");

-- CreateIndex
CREATE UNIQUE INDEX "UserTagAffinity_user_id_term_key" ON "UserTagAffinity"("user_id", "term");

-- AddForeignKey
ALTER TABLE "UserTagAffinity" ADD CONSTRAINT "UserTagAffinity_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
