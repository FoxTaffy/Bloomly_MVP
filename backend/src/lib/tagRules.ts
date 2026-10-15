/**
 * Единое правило допустимых символов в тегах: хештеги постов, теги групп (slug).
 * Буквы любых языков, цифры, «_» и «-». Фронтенд: frontend/src/lib/tagRules.ts — держать синхронно.
 */
const TAG_CLASS = '\\p{L}\\p{M}\\p{N}_-';

/** Не-символ тега — для замены или удаления недопустимых символов. */
export const NON_TAG_CHAR_RE = new RegExp(`[^${TAG_CLASS}]`, 'gu');

/** Тег целиком состоит из допустимых символов. */
export const TAG_RE = new RegExp(`^[${TAG_CLASS}]+$`, 'u');

/** Очистка тега: нижний регистр, без «#» в начале, без недопустимых символов. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#/, '').toLowerCase().replace(NON_TAG_CHAR_RE, '');
}
