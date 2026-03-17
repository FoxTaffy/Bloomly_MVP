-- CreateTable
CREATE TABLE "DealerListingComment" (
    "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID        NOT NULL,
    "author_id"  UUID        NOT NULL,
    "body"       VARCHAR(2000) NOT NULL,
    "parent_id"  UUID,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "DealerListingComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealerListingComment_listing_id_idx" ON "DealerListingComment"("listing_id");
CREATE INDEX "DealerListingComment_author_id_idx"  ON "DealerListingComment"("author_id");
CREATE INDEX "DealerListingComment_parent_id_idx"  ON "DealerListingComment"("parent_id");
CREATE INDEX "DealerListingComment_created_at_idx" ON "DealerListingComment"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "DealerListingComment" ADD CONSTRAINT "DealerListingComment_listing_id_fkey"
    FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealerListingComment" ADD CONSTRAINT "DealerListingComment_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealerListingComment" ADD CONSTRAINT "DealerListingComment_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "DealerListingComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
