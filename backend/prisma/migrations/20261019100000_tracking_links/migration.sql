-- Рекламные ссылки с UTM, клики, визиты и атрибуция регистраций (админка → «Трафик»).
CREATE TABLE "TrackingLink" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "code"         VARCHAR(40)  NOT NULL,
  "name"         VARCHAR(120) NOT NULL,
  "target_path"  VARCHAR(300) NOT NULL,
  "utm_source"   VARCHAR(60)  NOT NULL,
  "utm_medium"   VARCHAR(60)  NOT NULL,
  "utm_campaign" VARCHAR(100) NOT NULL,
  "utm_content"  VARCHAR(100),
  "utm_term"     VARCHAR(100),
  "is_active"    BOOLEAN      NOT NULL DEFAULT true,
  "created_by"   UUID,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrackingLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrackingLink_code_key" ON "TrackingLink"("code");
CREATE INDEX "TrackingLink_created_at_idx" ON "TrackingLink"("created_at");

CREATE TABLE "TrackingClick" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "link_id"      UUID         NOT NULL,
  "ip_hash"      VARCHAR(64)  NOT NULL,
  "user_agent"   VARCHAR(200),
  "referrer"     VARCHAR(300),
  "is_bot"       BOOLEAN      NOT NULL DEFAULT false,
  "is_duplicate" BOOLEAN      NOT NULL DEFAULT false,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackingClick_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrackingClick_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "TrackingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TrackingClick_link_id_created_at_idx" ON "TrackingClick"("link_id", "created_at");
CREATE INDEX "TrackingClick_link_id_ip_hash_created_at_idx" ON "TrackingClick"("link_id", "ip_hash", "created_at");

CREATE TABLE "TrackingVisit" (
  "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
  "link_id"      UUID,
  "click_id"     UUID,
  "visitor_id"   VARCHAR(64)  NOT NULL,
  "utm_source"   VARCHAR(60),
  "utm_medium"   VARCHAR(60),
  "utm_campaign" VARCHAR(100),
  "utm_content"  VARCHAR(100),
  "landing_path" VARCHAR(300),
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackingVisit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrackingVisit_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "TrackingLink"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TrackingVisit_link_id_created_at_idx" ON "TrackingVisit"("link_id", "created_at");
CREATE INDEX "TrackingVisit_visitor_id_created_at_idx" ON "TrackingVisit"("visitor_id", "created_at");
CREATE INDEX "TrackingVisit_utm_campaign_created_at_idx" ON "TrackingVisit"("utm_campaign", "created_at");

CREATE TABLE "UserAttribution" (
  "user_id"       UUID         NOT NULL,
  "visitor_id"    VARCHAR(64)  NOT NULL,
  "first_link_id" UUID,
  "last_link_id"  UUID,
  "first_utm"     JSONB,
  "last_utm"      JSONB,
  "first_seen_at" TIMESTAMP(3),
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAttribution_pkey" PRIMARY KEY ("user_id")
);
CREATE INDEX "UserAttribution_first_link_id_idx" ON "UserAttribution"("first_link_id");
CREATE INDEX "UserAttribution_last_link_id_idx" ON "UserAttribution"("last_link_id");
CREATE INDEX "UserAttribution_created_at_idx" ON "UserAttribution"("created_at");
