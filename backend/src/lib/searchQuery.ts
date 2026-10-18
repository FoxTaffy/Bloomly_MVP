import prisma from '../config/prisma.js';

/**
 * Общая логика поиска: разбор запроса на слова, исправление раскладки (ghbdtn → привет),
 * нечёткое сравнение по триграммам (pg_trgm) и оценка релевантности.
 */

const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбю';
const EN_TO_RU = new Map([...EN_KEYS].map((c, i) => [c, RU_KEYS[i]]));
const RU_TO_EN = new Map([...RU_KEYS].map((c, i) => [c, EN_KEYS[i]]));

const MAX_TERMS = 6;
const MAX_TERM_LEN = 64;

/** Слово, набранное не в той раскладке, → то же слово в другой раскладке; null, если нечего менять. */
export function swapLayout(word: string): string | null {
  const hasLatin = /[a-z]/.test(word);
  const hasCyr = /[а-яё]/.test(word);
  if (hasLatin === hasCyr) return null; // пусто или смесь алфавитов
  const map = hasLatin ? EN_TO_RU : RU_TO_EN;
  let out = '';
  for (const ch of word) {
    const mapped = map.get(ch === 'ё' ? 'е' : ch);
    if (!mapped) return null; // цифры и «_»/«-» не переводим
    out += mapped;
  }
  return out === word ? null : out;
}

export type SearchTerm = {
  /** слово как ввёл пользователь (без «#», в нижнем регистре) */
  text: string;
  /** альтернативы: исправленная раскладка */
  variants: string[];
};

export type ParsedQuery = {
  /** весь запрос целиком (для бонуса за точную фразу) */
  phrase: string;
  terms: SearchTerm[];
};

export function parseSearchQuery(raw: string): ParsedQuery {
  const phrase = raw.trim().replace(/^#/, '').toLowerCase().slice(0, 200);
  const words = phrase.split(/\s+/).map((w) => w.replace(/^#+/, '')).filter(Boolean).slice(0, MAX_TERMS);
  const terms = words.map((w) => {
    const text = w.slice(0, MAX_TERM_LEN);
    const swapped = swapLayout(text);
    return { text, variants: swapped ? [swapped] : [] };
  });
  return { phrase, terms };
}

/** Экранирование для LIKE/ILIKE. */
export function likeEscape(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

let trigramReady: Promise<boolean> | null = null;

/** pg_trgm доступен (расширение создаётся при первой необходимости; без него — только prefix/contains). */
export function trigramAvailable(): Promise<boolean> {
  if (!trigramReady) {
    trigramReady = prisma
      .$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS pg_trgm')
      .then(() => true)
      .catch(() => false);
  }
  return trigramReady;
}

/** Оценка совпадения текста со словом: 0 — нет, больше — лучше. */
export function textScore(haystack: string | null | undefined, word: string): number {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  if (h === word) return 10;
  const idx = h.indexOf(word);
  if (idx === -1) return 0;
  if (idx === 0) return 7;
  // начало слова: перед совпадением не буква/цифра
  return /[\p{L}\p{N}]/u.test(h[idx - 1]) ? 3 : 6;
}
