-- AlterTable
ALTER TABLE "RefreshToken"
  ADD COLUMN "device_name"  VARCHAR(120),
  ADD COLUMN "user_agent"   TEXT,
  ADD COLUMN "ip_address"   VARCHAR(64),
  ADD COLUMN "last_used_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
