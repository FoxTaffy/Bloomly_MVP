-- Заказы, созданные до связи с очередью работ, попадают в Todolist группы (статус — как у заказа).
INSERT INTO "GroupTodoItem" ("id", "group_id", "title", "status", "position", "order_id", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  o."group_id",
  LEFT(o."title", 200),
  o."status"::text,
  COALESCE((SELECT MAX(t."position") FROM "GroupTodoItem" t WHERE t."group_id" = o."group_id" AND t."deleted_at" IS NULL), -1)
    + ROW_NUMBER() OVER (PARTITION BY o."group_id" ORDER BY o."created_at"),
  o."id",
  o."created_at",
  now()
FROM "Order" o
WHERE o."deleted_at" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "GroupTodoItem" t WHERE t."order_id" = o."id");
