-- Image-based avatar frames marketplace: a frame is a decorative PNG overlay,
-- listed in Dealers' Den (category "avatar_frame") for discovery, free to claim
-- once approved. Admin-submitted frames go live immediately; artist-submitted
-- frames sit in "pending" until an admin reviews them.

CREATE TABLE "AvatarFrame" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "listing_id"        UUID,
  "creator_id"        UUID NOT NULL,
  "name"              VARCHAR(120) NOT NULL,
  "image_url"         TEXT NOT NULL,
  "price"             DECIMAL(10,2) NOT NULL DEFAULT 0,
  "default_offset_x"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "default_offset_y"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "default_scale"     DOUBLE PRECISION NOT NULL DEFAULT 1,
  "default_rotation"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status"            VARCHAR(20) NOT NULL DEFAULT 'pending',
  "rejection_reason"  TEXT,
  "reviewed_by"       UUID,
  "reviewed_at"       TIMESTAMP(6),
  "created_at"        TIMESTAMP(6) NOT NULL DEFAULT now(),
  "deleted_at"        TIMESTAMP(6),

  CONSTRAINT "AvatarFrame_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AvatarFrame_listing_id_key" ON "AvatarFrame"("listing_id");
CREATE INDEX "AvatarFrame_status_idx" ON "AvatarFrame"("status");
CREATE INDEX "AvatarFrame_creator_id_idx" ON "AvatarFrame"("creator_id");

ALTER TABLE "AvatarFrame"
  ADD CONSTRAINT "AvatarFrame_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AvatarFrame_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "DealerListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserAvatarFrame" (
  "user_id"     UUID NOT NULL,
  "frame_id"    UUID NOT NULL,
  "offset_x"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "offset_y"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "scale"       DOUBLE PRECISION NOT NULL DEFAULT 1,
  "rotation"    DOUBLE PRECISION NOT NULL DEFAULT 0,
  "acquired_at" TIMESTAMP(6) NOT NULL DEFAULT now(),

  CONSTRAINT "UserAvatarFrame_pkey" PRIMARY KEY ("user_id", "frame_id")
);

ALTER TABLE "UserAvatarFrame"
  ADD CONSTRAINT "UserAvatarFrame_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "UserAvatarFrame_frame_id_fkey" FOREIGN KEY ("frame_id") REFERENCES "AvatarFrame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "profile_frame_id" UUID;

ALTER TABLE "User"
  ADD CONSTRAINT "User_profile_frame_id_fkey" FOREIGN KEY ("profile_frame_id") REFERENCES "AvatarFrame"("id") ON DELETE SET NULL ON UPDATE CASCADE;
