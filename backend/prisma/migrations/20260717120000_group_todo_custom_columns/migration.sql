-- Group.todo_columns: custom kanban columns for the group Todolist ([] = use default 5-stage set)
ALTER TABLE "Group" ADD COLUMN "todo_columns" JSONB DEFAULT '[]';

-- GroupTodoItem.status: was a fixed TodoStatus enum, now a free key referencing
-- either a Group.todo_columns entry or one of the default stage keys.
ALTER TABLE "GroupTodoItem" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "GroupTodoItem" ALTER COLUMN "status" TYPE VARCHAR(30) USING "status"::text;
ALTER TABLE "GroupTodoItem" ALTER COLUMN "status" SET DEFAULT 'WAITING';
