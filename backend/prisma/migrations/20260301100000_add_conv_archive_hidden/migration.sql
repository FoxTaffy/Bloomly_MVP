-- AlterTable: add archive / hidden flags to conversation participants
ALTER TABLE "ConversationParticipant"
    ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "hidden"   BOOLEAN NOT NULL DEFAULT false;
