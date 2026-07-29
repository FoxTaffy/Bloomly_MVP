-- CreateTable
CREATE TABLE "PostNotInterested" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "term_deltas" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostNotInterested_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostNotInterested_user_id_post_id_key" ON "PostNotInterested"("user_id", "post_id");

-- AddForeignKey
ALTER TABLE "PostNotInterested" ADD CONSTRAINT "PostNotInterested_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostNotInterested" ADD CONSTRAINT "PostNotInterested_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
