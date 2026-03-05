-- AlterTable: Add artist_since to User
ALTER TABLE "User" ADD COLUMN "artist_since" TIMESTAMP(6);

-- AlterTable: Add members_count to Group (denormalized counter)
ALTER TABLE "Group" ADD COLUMN "members_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill members_count from existing GroupMember rows
UPDATE "Group" g
SET "members_count" = (
  SELECT COUNT(*)
  FROM "GroupMember" gm
  WHERE gm."group_id" = g."id"
);
