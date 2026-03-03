-- Add subscription tier to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "subscription_tier" VARCHAR(20) NOT NULL DEFAULT 'free';

-- Add profile customization fields to User
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "profile_theme"  VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "profile_bg_url" TEXT,
  ADD COLUMN IF NOT EXISTS "profile_frame"  VARCHAR(50);

-- Subscription plans table (for future billing integration)
CREATE TABLE IF NOT EXISTS "SubscriptionPlan" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id"     UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "tier"        VARCHAR(20) NOT NULL DEFAULT 'free',
  "starts_at"   TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "ends_at"     TIMESTAMP(3),
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "SubscriptionPlan_user_id_idx" ON "SubscriptionPlan"("user_id");
