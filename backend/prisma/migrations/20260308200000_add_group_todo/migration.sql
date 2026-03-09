-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('WAITING', 'SKETCH', 'LINEART', 'COLORING', 'FINISHED');

-- CreateTable
CREATE TABLE "GroupTodoItem" (
    "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id"    UUID NOT NULL,
    "title"       VARCHAR(200) NOT NULL,
    "description" TEXT,
    "status"      "TodoStatus" NOT NULL DEFAULT 'WAITING',
    "position"    INTEGER NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    "deleted_at"  TIMESTAMP(3),

    CONSTRAINT "GroupTodoItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GroupTodoItem_group_id_idx" ON "GroupTodoItem"("group_id");

-- CreateIndex
CREATE INDEX "GroupTodoItem_group_id_deleted_at_idx" ON "GroupTodoItem"("group_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "GroupTodoItem" ADD CONSTRAINT "GroupTodoItem_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
