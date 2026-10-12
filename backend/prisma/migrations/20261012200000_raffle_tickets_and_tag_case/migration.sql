-- Raffle tickets: one row per ticket so a winner can be drawn fairly.
CREATE TABLE IF NOT EXISTS "DenRaffleTicket" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "listing_id" UUID NOT NULL,
  "buyer_id"   UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DenRaffleTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DenRaffleTicket_listing_id_idx" ON "DenRaffleTicket"("listing_id");
CREATE UNIQUE INDEX IF NOT EXISTS "DenRaffleTicket_listing_id_buyer_id_key" ON "DenRaffleTicket"("listing_id","buyer_id");
ALTER TABLE "DenRaffleTicket" ADD CONSTRAINT "DenRaffleTicket_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DenRaffleTicket" ADD CONSTRAINT "DenRaffleTicket_buyer_id_fkey"
  FOREIGN KEY ("buyer_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Tags are matched case-insensitively; normalise the ones already stored.
UPDATE "DealerListing"
SET "tags" = ARRAY(SELECT DISTINCT lower(trim(t)) FROM unnest("tags") AS t WHERE trim(t) <> '')
WHERE "tags" IS NOT NULL AND "tags" <> '{}';
