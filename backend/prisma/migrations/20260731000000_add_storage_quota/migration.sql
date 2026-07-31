-- Track cumulative media storage usage per user, to enforce the per-tier
-- storage quotas advertised on the subscription page (Lite 5GB / Pro 20GB / Business 100GB).
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "storage_used_bytes" BIGINT NOT NULL DEFAULT 0;
