-- AlterTable
ALTER TABLE "ConversationParticipant" ADD COLUMN     "muted_until" TIMESTAMP(3),
ADD COLUMN     "sound_muted" BOOLEAN NOT NULL DEFAULT false;
