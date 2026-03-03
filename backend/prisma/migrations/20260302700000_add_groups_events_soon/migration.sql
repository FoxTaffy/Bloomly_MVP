-- CreateTable: Group
CREATE TABLE "Group" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
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

-- CreateTable: GroupMember
CREATE TABLE "GroupMember" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable: GroupPost
CREATE TABLE "GroupPost" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Event
CREATE TABLE "Event" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "short_code" VARCHAR(10) NOT NULL,
    "description" TEXT,
    "banner_url" TEXT,
    "location_name" VARCHAR(200),
    "location_lat" DOUBLE PRECISION,
    "location_lng" DOUBLE PRECISION,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'announced',
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "theme" JSONB DEFAULT '{}',
    "attendee_count" INTEGER NOT NULL DEFAULT 0,
    "is_top" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TicketTier
CREATE TABLE "TicketTier" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "total_count" INTEGER NOT NULL,
    "sold_count" INTEGER NOT NULL DEFAULT 0,
    "sale_starts_at" TIMESTAMP(3),
    "sale_ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SoonBadge
CREATE TABLE "SoonBadge" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "show_badge" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoonBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CommissionInfo
CREATE TABLE "CommissionInfo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'closed',
    "base_prices" JSONB DEFAULT '{}',
    "currency" VARCHAR(10) NOT NULL DEFAULT 'USD',
    "tos_text" TEXT,
    "queue_count" INTEGER NOT NULL DEFAULT 0,
    "max_queue" INTEGER NOT NULL DEFAULT 5,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable: GroupAchievement
CREATE TABLE "GroupAchievement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(60) NOT NULL,
    "color" VARCHAR(20),
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");
CREATE INDEX "Group_owner_id_idx" ON "Group"("owner_id");
CREATE INDEX "Group_type_idx" ON "Group"("type");

CREATE INDEX "GroupMember_user_id_idx" ON "GroupMember"("user_id");

CREATE UNIQUE INDEX "GroupPost_group_id_post_id_key" ON "GroupPost"("group_id", "post_id");

CREATE INDEX "Event_group_id_idx" ON "Event"("group_id");
CREATE INDEX "Event_starts_at_idx" ON "Event"("starts_at");
CREATE INDEX "Event_status_idx" ON "Event"("status");

CREATE INDEX "TicketTier_event_id_idx" ON "TicketTier"("event_id");

CREATE UNIQUE INDEX "SoonBadge_user_id_event_id_key" ON "SoonBadge"("user_id", "event_id");
CREATE INDEX "SoonBadge_user_id_idx" ON "SoonBadge"("user_id");
CREATE INDEX "SoonBadge_event_id_idx" ON "SoonBadge"("event_id");

CREATE UNIQUE INDEX "CommissionInfo_group_id_key" ON "CommissionInfo"("group_id");

CREATE INDEX "GroupAchievement_group_id_idx" ON "GroupAchievement"("group_id");

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupPost" ADD CONSTRAINT "GroupPost_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Event" ADD CONSTRAINT "Event_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TicketTier" ADD CONSTRAINT "TicketTier_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SoonBadge" ADD CONSTRAINT "SoonBadge_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoonBadge" ADD CONSTRAINT "SoonBadge_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CommissionInfo" ADD CONSTRAINT "CommissionInfo_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupAchievement" ADD CONSTRAINT "GroupAchievement_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
