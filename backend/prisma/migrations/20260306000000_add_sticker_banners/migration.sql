CREATE TABLE "StickerBanner" (
    "id"           UUID    NOT NULL DEFAULT gen_random_uuid(),
    "title"        VARCHAR(120) NOT NULL,
    "subtitle"     VARCHAR(240),
    "tag_label"    VARCHAR(60),
    "image_url"    TEXT    NOT NULL,
    "link_url"     TEXT,
    "price_label"  VARCHAR(60),
    "gradient"     VARCHAR(120),
    "sort_order"   INTEGER NOT NULL DEFAULT 0,
    "is_active"    BOOLEAN NOT NULL DEFAULT true,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StickerBanner_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StickerBanner_sort_order_idx"  ON "StickerBanner"("sort_order");
CREATE INDEX "StickerBanner_is_active_idx"   ON "StickerBanner"("is_active");
