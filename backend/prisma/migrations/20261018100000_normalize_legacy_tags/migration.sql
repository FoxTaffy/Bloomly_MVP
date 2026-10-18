-- Старые теги с пробелами и прочими недопустимыми символами («баги блумли») приводим к виду,
-- который даёт normalizeTag (нижний регистр, только буквы/цифры/«_»/«-»), чтобы синонимы и
-- поиск работали. Если тег с таким именем уже есть — посты переносятся на него, дубль удаляется.
DO $$
DECLARE
  r RECORD;
  target_id uuid;
BEGIN
  FOR r IN
    SELECT id, name, regexp_replace(lower(name), '[^[:alnum:]_-]', '', 'g') AS norm
    FROM "Tag"
    WHERE name <> regexp_replace(lower(name), '[^[:alnum:]_-]', '', 'g')
  LOOP
    CONTINUE WHEN r.norm = '';
    SELECT id INTO target_id FROM "Tag" WHERE name = r.norm AND id <> r.id;
    IF target_id IS NULL THEN
      UPDATE "Tag" SET name = r.norm WHERE id = r.id;
    ELSE
      INSERT INTO "PostTag" (post_id, tag_id)
        SELECT post_id, target_id FROM "PostTag" WHERE tag_id = r.id
        ON CONFLICT DO NOTHING;
      DELETE FROM "PostTag" WHERE tag_id = r.id;
      DELETE FROM "Tag" WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
