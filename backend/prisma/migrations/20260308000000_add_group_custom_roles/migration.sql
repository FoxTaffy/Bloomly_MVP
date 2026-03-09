-- CreateTable
CREATE TABLE "GroupCustomRole" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "color" VARCHAR(20) NOT NULL DEFAULT '#9ca3af',
    "icon" VARCHAR(20) NOT NULL DEFAULT '🎖️',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupCustomRole_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GroupCustomRole" ADD CONSTRAINT "GroupCustomRole_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "GroupCustomRole_group_id_idx" ON "GroupCustomRole"("group_id");
