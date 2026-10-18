-- Нечёткий поиск (опечатки) по тегам, людям и группам: триграммные индексы.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Tag_name_trgm_idx"           ON "Tag"   USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_username_trgm_idx"      ON "User"  USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "User_display_name_trgm_idx"  ON "User"  USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Group_name_trgm_idx"         ON "Group" USING gin (name gin_trgm_ops);
