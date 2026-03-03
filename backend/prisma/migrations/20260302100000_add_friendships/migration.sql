-- CreateTable
CREATE TABLE IF NOT EXISTS "Friendship" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "requester_id" UUID         NOT NULL,
  "addressee_id" UUID         NOT NULL,
  "status"       VARCHAR(20)  NOT NULL DEFAULT 'pending',
  "created_at"   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Friendship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Friendship_requester_addressee_unique" UNIQUE ("requester_id", "addressee_id"),
  FOREIGN KEY ("requester_id") REFERENCES "User"("id") ON DELETE CASCADE,
  FOREIGN KEY ("addressee_id") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "Friendship_addressee_id_status_idx" ON "Friendship"("addressee_id", "status");
CREATE INDEX IF NOT EXISTS "Friendship_requester_id_idx" ON "Friendship"("requester_id");
