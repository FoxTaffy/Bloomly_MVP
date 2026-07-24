-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "group_id" UUID;

-- CreateIndex
CREATE INDEX "Comment_group_id_idx" ON "Comment"("group_id");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
