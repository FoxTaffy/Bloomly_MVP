-- Время старта и завершения заказа: основа для реальной средней скорости выполнения.
ALTER TABLE "Order" ADD COLUMN "started_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "finished_at" TIMESTAMP(3);
