-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMP(3),

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationParticipant_conversation_id_user_id_key"
    ON "ConversationParticipant"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "ConversationParticipant_user_id_idx"
    ON "ConversationParticipant"("user_id");

-- CreateIndex
CREATE INDEX "Message_conversation_id_created_at_idx"
    ON "Message"("conversation_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "ConversationParticipant"
    ADD CONSTRAINT "ConversationParticipant_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant"
    ADD CONSTRAINT "ConversationParticipant_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message"
    ADD CONSTRAINT "Message_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "Conversation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message"
    ADD CONSTRAINT "Message_sender_id_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
