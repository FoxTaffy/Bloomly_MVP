-- Dealers Den v2 migration

-- Add den_frozen to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "den_frozen" BOOLEAN NOT NULL DEFAULT false;

-- Add commission fields to DealerListing
ALTER TABLE "DealerListing" ADD COLUMN IF NOT EXISTS "commission_slots_total" INTEGER;
ALTER TABLE "DealerListing" ADD COLUMN IF NOT EXISTS "commission_slots_taken" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DealerListing" ADD COLUMN IF NOT EXISTS "commission_eta_days" INTEGER;
ALTER TABLE "DealerListing" ADD COLUMN IF NOT EXISTS "commission_form_fields" JSONB DEFAULT '[]';

-- DenTrustScore
CREATE TABLE IF NOT EXISTS "DenTrustScore" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"         UUID NOT NULL,
  "score"           INTEGER NOT NULL DEFAULT 0,
  "tier"            TEXT NOT NULL DEFAULT 'new',
  "total_deals"     INTEGER NOT NULL DEFAULT 0,
  "completed_deals" INTEGER NOT NULL DEFAULT 0,
  "disputes_lost"   INTEGER NOT NULL DEFAULT 0,
  "avg_rating"      DECIMAL(3,2) NOT NULL DEFAULT 0,
  "updated_at"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DenTrustScore_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DenTrustScore_user_id_key" ON "DenTrustScore"("user_id");
ALTER TABLE "DenTrustScore" ADD CONSTRAINT "DenTrustScore_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DenReview
CREATE TABLE IF NOT EXISTS "DenReview" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "listing_id"  UUID NOT NULL,
  "reviewer_id" UUID NOT NULL,
  "seller_id"   UUID NOT NULL,
  "rating"      INTEGER NOT NULL,
  "tags"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "text"        VARCHAR(1000),
  "photo_url"   TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  "deleted_at"  TIMESTAMP(3),
  CONSTRAINT "DenReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DenReview_listing_id_reviewer_id_key" ON "DenReview"("listing_id","reviewer_id");
CREATE INDEX IF NOT EXISTS "DenReview_seller_id_idx" ON "DenReview"("seller_id");
CREATE INDEX IF NOT EXISTS "DenReview_listing_id_idx" ON "DenReview"("listing_id");
ALTER TABLE "DenReview" ADD CONSTRAINT "DenReview_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DenReview" ADD CONSTRAINT "DenReview_reviewer_id_fkey"
  FOREIGN KEY ("reviewer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DenReview" ADD CONSTRAINT "DenReview_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DenWeeklyTop
CREATE TABLE IF NOT EXISTS "DenWeeklyTop" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"     UUID NOT NULL,
  "rank"        INTEGER NOT NULL,
  "week_start"  DATE NOT NULL,
  "sales_count" INTEGER NOT NULL,
  "avg_rating"  DECIMAL(3,2) NOT NULL,
  "new_reviews" INTEGER NOT NULL,
  "score"       DECIMAL(10,2) NOT NULL,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DenWeeklyTop_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DenWeeklyTop_user_id_week_start_key" ON "DenWeeklyTop"("user_id","week_start");
CREATE INDEX IF NOT EXISTS "DenWeeklyTop_week_start_rank_idx" ON "DenWeeklyTop"("week_start","rank");
ALTER TABLE "DenWeeklyTop" ADD CONSTRAINT "DenWeeklyTop_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DenWishlist
CREATE TABLE IF NOT EXISTS "DenWishlist" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    UUID NOT NULL,
  "listing_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DenWishlist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DenWishlist_user_id_listing_id_key" ON "DenWishlist"("user_id","listing_id");
CREATE INDEX IF NOT EXISTS "DenWishlist_listing_id_idx" ON "DenWishlist"("listing_id");
ALTER TABLE "DenWishlist" ADD CONSTRAINT "DenWishlist_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DenWishlist" ADD CONSTRAINT "DenWishlist_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CommissionBooking
CREATE TABLE IF NOT EXISTS "CommissionBooking" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "listing_id"     UUID NOT NULL,
  "buyer_id"       UUID NOT NULL,
  "queue_position" INTEGER NOT NULL,
  "form_data"      JSONB,
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "notes"          VARCHAR(2000),
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMP(3) NOT NULL,
  "deleted_at"     TIMESTAMP(3),
  CONSTRAINT "CommissionBooking_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommissionBooking_listing_id_queue_position_idx" ON "CommissionBooking"("listing_id","queue_position");
CREATE INDEX IF NOT EXISTS "CommissionBooking_buyer_id_idx" ON "CommissionBooking"("buyer_id");
ALTER TABLE "CommissionBooking" ADD CONSTRAINT "CommissionBooking_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommissionBooking" ADD CONSTRAINT "CommissionBooking_buyer_id_fkey"
  FOREIGN KEY ("buyer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DenDispute
CREATE TABLE IF NOT EXISTS "DenDispute" (
  "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
  "listing_id"   UUID NOT NULL,
  "buyer_id"     UUID NOT NULL,
  "seller_id"    UUID NOT NULL,
  "reason"       VARCHAR(2000) NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'open',
  "seller_reply" VARCHAR(2000),
  "resolved_by"  UUID,
  "resolution"   VARCHAR(500),
  "opened_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "replied_at"   TIMESTAMP(3),
  "resolved_at"  TIMESTAMP(3),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  "deleted_at"   TIMESTAMP(3),
  CONSTRAINT "DenDispute_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DenDispute_listing_id_idx" ON "DenDispute"("listing_id");
CREATE INDEX IF NOT EXISTS "DenDispute_buyer_id_idx" ON "DenDispute"("buyer_id");
CREATE INDEX IF NOT EXISTS "DenDispute_seller_id_idx" ON "DenDispute"("seller_id");
ALTER TABLE "DenDispute" ADD CONSTRAINT "DenDispute_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DenDispute" ADD CONSTRAINT "DenDispute_buyer_id_fkey"
  FOREIGN KEY ("buyer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DenDispute" ADD CONSTRAINT "DenDispute_seller_id_fkey"
  FOREIGN KEY ("seller_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DenFair
CREATE TABLE IF NOT EXISTS "DenFair" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "title"       VARCHAR(200) NOT NULL,
  "description" TEXT,
  "theme"       VARCHAR(100),
  "banner_url"  TEXT,
  "starts_at"   TIMESTAMP(3) NOT NULL,
  "ends_at"     TIMESTAMP(3) NOT NULL,
  "status"      TEXT NOT NULL DEFAULT 'upcoming',
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL,
  "deleted_at"  TIMESTAMP(3),
  CONSTRAINT "DenFair_pkey" PRIMARY KEY ("id")
);

-- DenFairParticipant
CREATE TABLE IF NOT EXISTS "DenFairParticipant" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "fair_id"    UUID NOT NULL,
  "user_id"    UUID NOT NULL,
  "listing_id" UUID,
  "status"     TEXT NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DenFairParticipant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DenFairParticipant_fair_id_user_id_key" ON "DenFairParticipant"("fair_id","user_id");
ALTER TABLE "DenFairParticipant" ADD CONSTRAINT "DenFairParticipant_fair_id_fkey"
  FOREIGN KEY ("fair_id") REFERENCES "DenFair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DenFairParticipant" ADD CONSTRAINT "DenFairParticipant_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DenFairParticipant" ADD CONSTRAINT "DenFairParticipant_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
