-- CreateTable
CREATE TABLE "UserBookmark" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID NOT NULL,
    "target_id"  UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupBookmark" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID NOT NULL,
    "group_id"   UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBookmark_user_id_target_id_key" ON "UserBookmark"("user_id", "target_id");
CREATE INDEX "UserBookmark_user_id_idx"   ON "UserBookmark"("user_id");
CREATE INDEX "UserBookmark_target_id_idx" ON "UserBookmark"("target_id");

-- CreateIndex
CREATE UNIQUE INDEX "GroupBookmark_user_id_group_id_key" ON "GroupBookmark"("user_id", "group_id");
CREATE INDEX "GroupBookmark_user_id_idx"  ON "GroupBookmark"("user_id");
CREATE INDEX "GroupBookmark_group_id_idx" ON "GroupBookmark"("group_id");

-- AddForeignKey
ALTER TABLE "UserBookmark" ADD CONSTRAINT "UserBookmark_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBookmark" ADD CONSTRAINT "UserBookmark_target_id_fkey"
    FOREIGN KEY ("target_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupBookmark" ADD CONSTRAINT "GroupBookmark_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupBookmark" ADD CONSTRAINT "GroupBookmark_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
