-- Group.balance — funded by member donations from their personal Wallet
ALTER TABLE "Group" ADD COLUMN "balance" DECIMAL(18,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "GroupTransaction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "user_id" UUID,
    "type" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "message" VARCHAR(280),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupTransaction_group_id_created_at_idx" ON "GroupTransaction"("group_id", "created_at");

-- AddForeignKey
ALTER TABLE "GroupTransaction" ADD CONSTRAINT "GroupTransaction_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupTransaction" ADD CONSTRAINT "GroupTransaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
