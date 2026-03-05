-- CreateTable DealerListing
CREATE TABLE "DealerListing" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "seller_id"     UUID NOT NULL,
    "title"         VARCHAR(200) NOT NULL,
    "description"   TEXT,
    "price"         DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency"      VARCHAR(10) NOT NULL DEFAULT 'USD',
    "category"      VARCHAR(50) NOT NULL DEFAULT 'other',
    "type"          VARCHAR(20) NOT NULL DEFAULT 'physical',
    "images"        TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status"        VARCHAR(20) NOT NULL DEFAULT 'active',
    "quantity"      INTEGER NOT NULL DEFAULT 1,
    "quantity_sold" INTEGER NOT NULL DEFAULT 0,
    "is_nsfw"       BOOLEAN NOT NULL DEFAULT false,
    "tags"          TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at"    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at"    TIMESTAMP(6),

    CONSTRAINT "DealerListing_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DealerListing" ADD CONSTRAINT "DealerListing_seller_id_fkey"
    FOREIGN KEY ("seller_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "DealerListing_seller_id_idx" ON "DealerListing"("seller_id");
CREATE INDEX "DealerListing_status_idx" ON "DealerListing"("status");
CREATE INDEX "DealerListing_category_idx" ON "DealerListing"("category");
CREATE INDEX "DealerListing_created_at_idx" ON "DealerListing"("created_at" DESC);
