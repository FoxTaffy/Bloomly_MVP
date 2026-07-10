-- AlterTable: add new privacy columns
ALTER TABLE "User" ADD COLUMN     "messages_privacy" VARCHAR(20) NOT NULL DEFAULT 'everyone';
ALTER TABLE "User" ADD COLUMN     "comments_privacy" VARCHAR(20) NOT NULL DEFAULT 'everyone';
ALTER TABLE "User" ADD COLUMN     "mentions_privacy" VARCHAR(20) NOT NULL DEFAULT 'everyone';
ALTER TABLE "User" ADD COLUMN     "online_status_visibility" VARCHAR(20) NOT NULL DEFAULT 'everyone';
ALTER TABLE "User" ADD COLUMN     "friends_list_visibility" VARCHAR(20) NOT NULL DEFAULT 'everyone';
ALTER TABLE "User" ADD COLUMN     "profile_visibility" VARCHAR(20) NOT NULL DEFAULT 'everyone';

-- Migrate existing allow_messages boolean into messages_privacy
UPDATE "User" SET "messages_privacy" = 'nobody' WHERE "allow_messages" = false;

-- Drop the now-superseded boolean column
ALTER TABLE "User" DROP COLUMN "allow_messages";
