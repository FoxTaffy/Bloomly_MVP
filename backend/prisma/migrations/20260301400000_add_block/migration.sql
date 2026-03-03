-- AddTable Block
CREATE TABLE IF NOT EXISTS "Block" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "blocker_id"  UUID NOT NULL,
    "blocked_id"  UUID NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Block_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Block_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Block_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Block_blocker_id_blocked_id_key" ON "Block"("blocker_id", "blocked_id");
CREATE INDEX IF NOT EXISTS "Block_blocker_id_idx" ON "Block"("blocker_id");
