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

/** Очистка того, что ввёл пользователь: нижний регистр, пробелы → «_», прочие недопустимые символы удаляются. */
export function sanitizeTagInput(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, '_').replace(NON_TAG_CHAR_RE, '')
}

/** Slug группы — только английские буквы, цифры, «_» и «-» (в отличие от тегов). */
export const NON_SLUG_CHAR_RE = /[^a-z0-9_-]/g

/** Ввод slug: нижний регистр, всё кроме a-z, 0-9, «_» и «-» удаляется. */
export function sanitizeSlugInput(raw: string): string {
  return raw.toLowerCase().replace(NON_SLUG_CHAR_RE, '')
}

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
}

/** Транслитерация кириллицы в латиницу — для автогенерации slug из названия. */
export function transliterate(raw: string): string {
  return raw.toLowerCase().replace(/[а-яёіїєґ]/g, (c) => CYR_TO_LAT[c] ?? '')
}
