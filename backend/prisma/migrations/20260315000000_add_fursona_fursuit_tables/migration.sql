-- Migration: 20260315000000_add_fursona_fursuit_tables
-- Adds dedicated Fursona (1:1) and Fursuit (1:N) tables linked to User.

-- ── Fursona ──────────────────────────────────────────────────────────────────
CREATE TABLE "Fursona" (
  "id"                     UUID          NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                UUID          NOT NULL,
  "name"                   VARCHAR(80)   NOT NULL DEFAULT '',
  "species"                TEXT[]        NOT NULL DEFAULT '{}',
  "colors"                 TEXT[]        NOT NULL DEFAULT '{}',
  "likes_dislikes_visible" BOOLEAN       NOT NULL DEFAULT TRUE,
  "likes"                  TEXT[]        NOT NULL DEFAULT '{}',
  "dislikes"               TEXT[]        NOT NULL DEFAULT '{}',
  "reference_image_url"    TEXT,
  "created_at"             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"             TIMESTAMP(3),

  CONSTRAINT "Fursona_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one fursona per user
CREATE UNIQUE INDEX "Fursona_user_id_key" ON "Fursona"("user_id");

-- FK
ALTER TABLE "Fursona"
  ADD CONSTRAINT "Fursona_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Fursona_user_id_idx" ON "Fursona"("user_id");

-- ── Fursuit ───────────────────────────────────────────────────────────────────
CREATE TABLE "Fursuit" (
  "id"                    UUID          NOT NULL DEFAULT gen_random_uuid(),
  "user_id"               UUID          NOT NULL,
  "image_url"             TEXT,
  "maker_id"              UUID,
  "external_maker_links"  TEXT[]        NOT NULL DEFAULT '{}',
  "description"           TEXT,
  "created_at"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"            TIMESTAMP(3),

  CONSTRAINT "Fursuit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Fursuit"
  ADD CONSTRAINT "Fursuit_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Fursuit_user_id_idx" ON "Fursuit"("user_id");
