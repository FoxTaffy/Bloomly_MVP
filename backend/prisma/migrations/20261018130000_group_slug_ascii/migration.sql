-- Group slugs are ASCII-only (a-z, 0-9, "_", "-"). Transliterate legacy slugs that contain
-- Cyrillic or other characters; the old slug is kept in slug_aliases so old links still redirect.
DO $$
DECLARE
  g RECORD;
  base TEXT;
  cand TEXT;
  n INT;
BEGIN
  FOR g IN SELECT id, slug FROM "Group" WHERE slug !~ '^[a-z0-9_-]+$' ORDER BY created_at LOOP
    base := lower(g.slug);
    -- multi-letter sounds first, then single letters, then drop everything else
    base := replace(base, 'щ', 'sch');
    base := replace(base, 'ж', 'zh');
    base := replace(base, 'ч', 'ch');
    base := replace(base, 'ш', 'sh');
    base := replace(base, 'ц', 'ts');
    base := replace(base, 'ю', 'yu');
    base := replace(base, 'я', 'ya');
    base := replace(base, 'є', 'ye');
    base := replace(base, 'ї', 'yi');
    -- ъ / ь are dropped (they have no counterpart in the "to" list)
    base := translate(base,
      'абвгдеёзийклмнопрстуфхыэіґъь',
      'abvgdeeziyklmnoprstufhyeig');
    base := regexp_replace(base, '[^a-z0-9_-]+', '-', 'g');
    base := regexp_replace(base, '-+', '-', 'g');
    base := regexp_replace(base, '^-+|-+$', '', 'g');
    base := left(base, 54);
    base := regexp_replace(base, '-+$', '', 'g');
    IF length(base) < 3 THEN
      base := 'group-' || left(replace(g.id::text, '-', ''), 8);
    END IF;

    cand := base;
    n := 1;
    WHILE EXISTS (
      SELECT 1 FROM "Group"
      WHERE id <> g.id AND (slug = cand OR cand = ANY(slug_aliases))
    ) LOOP
      n := n + 1;
      cand := base || '-' || n;
    END LOOP;

    UPDATE "Group"
    SET slug = cand,
        slug_aliases = (
          SELECT COALESCE(array_agg(a), '{}') FROM (
            SELECT a FROM unnest(array_append(array_remove(slug_aliases, cand), g.slug)) WITH ORDINALITY t(a, i)
            ORDER BY i DESC LIMIT 10
          ) x
        )
    WHERE id = g.id;
  END LOOP;
END $$;
