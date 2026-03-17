-- ── Extend DealerListing with auction / raffle / YCH fields ──────────────────

ALTER TABLE "DealerListing"
  ADD COLUMN IF NOT EXISTS "listing_kind"         VARCHAR(20)    NOT NULL DEFAULT 'fixed',      -- fixed | auction | ych | raffle
  ADD COLUMN IF NOT EXISTS "auction_ends_at"      TIMESTAMP(6),                                 -- when the auction closes
  ADD COLUMN IF NOT EXISTS "current_bid"          DECIMAL(12,2),                                -- highest bid placed so far
  ADD COLUMN IF NOT EXISTS "bid_count"            INTEGER        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bid_increment"        DECIMAL(12,2)  NOT NULL DEFAULT 1,             -- minimum raise per bid
  ADD COLUMN IF NOT EXISTS "auto_buy_price"       DECIMAL(12,2),                                -- instant-win / AB price
  ADD COLUMN IF NOT EXISTS "raffle_max_tickets"   INTEGER,                                      -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS "raffle_tickets_sold"  INTEGER        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "winner_id"            UUID;

CREATE INDEX IF NOT EXISTS "DealerListing_listing_kind_idx"    ON "DealerListing"("listing_kind");
CREATE INDEX IF NOT EXISTS "DealerListing_auction_ends_at_idx" ON "DealerListing"("auction_ends_at");

-- ── DealerBid ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "DealerBid" (
  "id"         UUID          NOT NULL DEFAULT gen_random_uuid(),
  "listing_id" UUID          NOT NULL,
  "bidder_id"  UUID          NOT NULL,
  "amount"     DECIMAL(12,2) NOT NULL,
  "message"    TEXT,
  "created_at" TIMESTAMP(6)  NOT NULL DEFAULT NOW(),

  CONSTRAINT "DealerBid_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DealerBid_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE CASCADE,
  CONSTRAINT "DealerBid_bidder_id_fkey"
    FOREIGN KEY ("bidder_id") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "DealerBid_listing_id_idx" ON "DealerBid"("listing_id");
CREATE INDEX IF NOT EXISTS "DealerBid_bidder_id_idx"  ON "DealerBid"("bidder_id");
CREATE INDEX IF NOT EXISTS "DealerBid_created_at_idx" ON "DealerBid"("created_at" DESC);
