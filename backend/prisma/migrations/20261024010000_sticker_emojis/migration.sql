-- Эмодзи стикеров (параллельно "stickers"): подсказки стикеров по введённому эмодзи. Безопасно: новая колонка с пустым значением по умолчанию.
ALTER TABLE "StickerPack" ADD COLUMN IF NOT EXISTS "sticker_emojis" TEXT[] DEFAULT ARRAY[]::TEXT[];
