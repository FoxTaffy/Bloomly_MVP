-- Безопасная сделка: оплата заказа удерживается системой и уходит художнику только после подтверждения заказчика.
ALTER TABLE "Order" ADD COLUMN "escrow_status" VARCHAR(10) NOT NULL DEFAULT 'none';
ALTER TABLE "Order" ADD COLUMN "escrow_blm" DECIMAL(18,2);
ALTER TABLE "Order" ADD COLUMN "escrow_held_at" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "escrow_released_at" TIMESTAMP(3);

-- Промежуточные этапы работы (скетчи, WIP, комментарии) в карточке заказа.
CREATE TABLE "OrderProgress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "stage" "TodoStatus",
    "text" VARCHAR(1000),
    "image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "OrderProgress_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderProgress_order_id_created_at_idx" ON "OrderProgress"("order_id", "created_at");

ALTER TABLE "OrderProgress" ADD CONSTRAINT "OrderProgress_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderProgress" ADD CONSTRAINT "OrderProgress_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
