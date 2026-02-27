-- Add relationship_since to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "relationship_since" TIMESTAMP;

-- Create RelationshipRequest table (with FK constraints inline)
CREATE TABLE IF NOT EXISTS "RelationshipRequest" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "from_id"    UUID        NOT NULL,
    "to_id"      UUID        NOT NULL,
    "status"     VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelationshipRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RelationshipRequest_from_id_fkey"
        FOREIGN KEY ("from_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RelationshipRequest_to_id_fkey"
        FOREIGN KEY ("to_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "RelationshipRequest_from_to_unique"
    ON "RelationshipRequest"("from_id", "to_id");

CREATE INDEX IF NOT EXISTS "RelationshipRequest_to_id_status_idx"
    ON "RelationshipRequest"("to_id", "status");

-- Add ref_id to Notification (generic reference ID, e.g. for relationship requests)
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "ref_id" UUID;
