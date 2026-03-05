-- CreateTable
CREATE TABLE "Group" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "type" VARCHAR(20) NOT NULL,
    "owner_id" UUID NOT NULL,
    "avatar_url" TEXT,
    "banner_url" TEXT,
    "accent_color" VARCHAR(20),
    "mascot_url" TEXT,
    "social_links" JSONB DEFAULT '{}',
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "GroupPost" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "location" TEXT,
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "banner_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionInfo" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "tos_text" TEXT,
    "slots_max" INTEGER NOT NULL DEFAULT 0,
    "slots_taken" INTEGER NOT NULL DEFAULT 0,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAchievement" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoonBadge" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoonBadge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

-- CreateIndex
CREATE INDEX "Group_owner_id_idx" ON "Group"("owner_id");

-- CreateIndex
CREATE INDEX "Group_type_idx" ON "Group"("type");

-- CreateIndex
CREATE INDEX "GroupMember_user_id_idx" ON "GroupMember"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPost_group_id_post_id_key" ON "GroupPost"("group_id", "post_id");

-- CreateIndex
CREATE INDEX "Event_group_id_idx" ON "Event"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionInfo_group_id_key" ON "CommissionInfo"("group_id");

-- CreateIndex
CREATE INDEX "GroupAchievement_group_id_idx" ON "GroupAchievement"("group_id");

-- CreateIndex
CREATE INDEX "SoonBadge_user_id_idx" ON "SoonBadge"("user_id");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionInfo" ADD CONSTRAINT "CommissionInfo_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAchievement" ADD CONSTRAINT "GroupAchievement_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoonBadge" ADD CONSTRAINT "SoonBadge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Group extended fields
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "rules_text" TEXT;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "faq" JSONB DEFAULT '[]';
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "contact_phone" VARCHAR(30);
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "contact_email" VARCHAR(120);
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "about_text" TEXT;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "schedule" JSONB DEFAULT '[]';
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "what_to_bring" JSONB DEFAULT '[]';
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "is_nsfw" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "rating" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "rating_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "subscriber_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "production_time" VARCHAR(100);
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "delivery_info" VARCHAR(200);
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "completed_works" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "recent_works" JSONB DEFAULT '[]';
ALTER TABLE "Group" ADD COLUMN IF NOT EXISTS "guarantee_text" VARCHAR(300);

-- Event extended fields
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "schedule" JSONB DEFAULT '[]';
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "what_to_bring" JSONB DEFAULT '[]';
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "rules_text" TEXT;
ALTER TABLE "Event" ADD COLUMN IF NOT EXISTS "faq" JSONB DEFAULT '[]';

-- CommissionInfo extended fields
ALTER TABLE "CommissionInfo" ADD COLUMN IF NOT EXISTS "rush_slots" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommissionInfo" ADD COLUMN IF NOT EXISTS "rush_max" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CommissionInfo" ADD COLUMN IF NOT EXISTS "turnaround_days" VARCHAR(30);
ALTER TABLE "CommissionInfo" ADD COLUMN IF NOT EXISTS "price_list" JSONB DEFAULT '[]';
