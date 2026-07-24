-- CreateIndex
CREATE INDEX "Message_sender_id_created_at_idx" ON "Message"("sender_id", "created_at");
