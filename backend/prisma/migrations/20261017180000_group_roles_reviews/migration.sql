-- Кастомные роли группы становятся назначаемыми, отзывы о группе получают своё хранилище.
ALTER TABLE "GroupMember" ADD COLUMN "custom_role_id" UUID;

ALTER TABLE "GroupMember"
  ADD CONSTRAINT "GroupMember_custom_role_id_fkey"
  FOREIGN KEY ("custom_role_id") REFERENCES "GroupCustomRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "GroupMember_custom_role_id_idx" ON "GroupMember"("custom_role_id");

CREATE TABLE "GroupReview" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GroupReview_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GroupReview_rating_check" CHECK ("rating" BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX "GroupReview_group_id_user_id_key" ON "GroupReview"("group_id", "user_id");
CREATE INDEX "GroupReview_group_id_created_at_idx" ON "GroupReview"("group_id", "created_at");

ALTER TABLE "GroupReview" ADD CONSTRAINT "GroupReview_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupReview" ADD CONSTRAINT "GroupReview_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GroupJoinRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "message" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupJoinRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupJoinRequest_group_id_user_id_key" ON "GroupJoinRequest"("group_id", "user_id");
CREATE INDEX "GroupJoinRequest_group_id_created_at_idx" ON "GroupJoinRequest"("group_id", "created_at");

ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupJoinRequest" ADD CONSTRAINT "GroupJoinRequest_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
