-- Заказ в очереди работ группы: пункт Todolist ссылается на заказ, статусы синхронизируются.
ALTER TABLE "GroupTodoItem" ADD COLUMN "order_id" UUID;
CREATE UNIQUE INDEX "GroupTodoItem_order_id_key" ON "GroupTodoItem"("order_id");
ALTER TABLE "GroupTodoItem" ADD CONSTRAINT "GroupTodoItem_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
