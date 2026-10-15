/**
 * Единое правило допустимых символов в тегах: хештеги постов, теги групп (slug).
 * Буквы любых языков, цифры, «_» и «-». Бэкенд: backend/src/lib/tagRules.ts — держать синхронно.
 */
const TAG_CLASS = '\\p{L}\\p{M}\\p{N}_-'

/** Не-символ тега — для замены или удаления недопустимых символов. */
export const NON_TAG_CHAR_RE = new RegExp(`[^${TAG_CLASS}]`, 'gu')

/** Хештег в тексте: «#» и тело тега. */
export const HASHTAG_RE = new RegExp(`#([${TAG_CLASS}]+)`, 'gu')

/** Тег целиком состоит из допустимых символов. */
export const TAG_RE = new RegExp(`^[${TAG_CLASS}]+$`, 'u')

/** Очистка того, что ввёл пользователь: нижний регистр, без недопустимых символов. */
export function sanitizeTagInput(raw: string): string {
  return raw.toLowerCase().replace(NON_TAG_CHAR_RE, '')
}
