-- Начальный набор синонимов хештегов (alias → canonical, основной тег — английский).
-- Идемпотентно: существующие пары не трогаем. Дальше пополняется из админки.
INSERT INTO "TagSynonym" ("alias", "canonical") VALUES
  ('арт', 'art'),
  ('лис', 'fox'),
  ('лиса', 'fox'),
  ('лисица', 'fox'),
  ('foxes', 'fox'),
  ('фурри', 'furry'),
  ('фуррсьют', 'fursuits'),
  ('фурсьют', 'fursuits'),
  ('fursuit', 'fursuits'),
  ('фурсона', 'fursona'),
  ('лапы', 'paws'),
  ('лапа', 'paws'),
  ('paw', 'paws'),
  ('рендер', 'render'),
  ('мем', 'meme'),
  ('фото', 'photo'),
  ('аниме', 'anime'),
  ('анимация', 'animation'),
  ('дракон', 'dragons'),
  ('dragon', 'dragons'),
  ('скетч', 'sketch'),
  ('референс', 'reference'),
  ('новости', 'news')
ON CONFLICT ("alias") DO NOTHING;
