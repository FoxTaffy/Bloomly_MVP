// Эмодзи как последовательности (флаги, ZWJ-сочетания вроде 👩‍💻, оттенки кожи, ❤️ с VS16) — без Intl.Segmenter.
// Та же логика на сервере: backend/src/modules/stickers/service.ts (normalizeStickerEmojis).
const EMOJI_SEQ = '(?:\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*)'
const EMOJI_GLOBAL_RE = new RegExp(EMOJI_SEQ, 'gu')
const SINGLE_EMOJI_RE = new RegExp(`^${EMOJI_SEQ}$`, 'u')

/** Все эмодзи из строки по порядку, без повторов, не больше `limit`. */
export function emojiList(text: string, limit = 5): string[] {
  const out: string[] = []
  for (const m of text.matchAll(EMOJI_GLOBAL_RE)) {
    if (!out.includes(m[0])) out.push(m[0])
    if (out.length >= limit) break
  }
  return out
}

/** Сравнение без вариационного селектора: «❤» и «❤️» — один эмодзи. */
export const emojiKey = (emoji: string) => emoji.replace(/️/g, '')

/** В строке ровно один эмодзи (пробелы по краям не в счёт). */
export function singleEmoji(text: string): string | null {
  const t = text.trim()
  return t && SINGLE_EMOJI_RE.test(t) ? t : null
}
