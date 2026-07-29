-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "sender_group_id" UUID;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_sender_group_id_fkey" FOREIGN KEY ("sender_group_id") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
