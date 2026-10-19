-- Заявки на лоты Dealers' Den: подаются только в группу-продавца, без личных сообщений.
CREATE TABLE "ListingApplication" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "listing_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "applicant_id" UUID NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(6),
    CONSTRAINT "ListingApplication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ListingApplication_listing_id_applicant_id_key" ON "ListingApplication"("listing_id", "applicant_id");
CREATE INDEX "ListingApplication_group_id_status_created_at_idx" ON "ListingApplication"("group_id", "status", "created_at" DESC);
CREATE INDEX "ListingApplication_applicant_id_idx" ON "ListingApplication"("applicant_id");

ALTER TABLE "ListingApplication" ADD CONSTRAINT "ListingApplication_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingApplication" ADD CONSTRAINT "ListingApplication_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingApplication" ADD CONSTRAINT "ListingApplication_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
