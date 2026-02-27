-- AlterTable: add relationship_status and country to User

ALTER TABLE "User" ADD COLUMN "relationship_status" VARCHAR(50);
ALTER TABLE "User" ADD COLUMN "country" VARCHAR(80);
