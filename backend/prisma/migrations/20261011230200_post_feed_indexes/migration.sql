-- Индексы для ленты и сортировки по рейтингу
CREATE INDEX "Post_deleted_at_created_at_idx" ON "Post"("deleted_at", "created_at");
CREATE INDEX "Post_rating_idx" ON "Post"("rating");
