/**
 * Lightweight, dependency-free keyword extraction used to teach the feed algorithm about a
 * post's content beyond its explicit hashtags — repaws and dislikes both need to know "what is
 * this post actually about" from free text (RU + EN, this is a bilingual furry community).
 */
const STOPWORDS = new Set([
  // Russian
  'это', 'как', 'что', 'так', 'его', 'все', 'всех', 'всё', 'вот', 'был', 'была', 'были', 'быть',
  'вас', 'нас', 'мне', 'мой', 'моя', 'моё', 'мои', 'она', 'они', 'оно', 'эти', 'эта', 'этот', 'этой',
  'для', 'или', 'если', 'когда', 'где', 'чем', 'тем', 'кто', 'вам', 'нам', 'вы', 'ты', 'мы', 'он', 'я',
  'не', 'ни', 'да', 'нет', 'же', 'бы', 'ли', 'из', 'на', 'по', 'до', 'от', 'за', 'под', 'над', 'при',
  'без', 'про', 'уже', 'ещё', 'очень', 'просто', 'только', 'тоже', 'также', 'можно', 'нужно', 'надо',
  'кто-то', 'что-то', 'быть', 'есть', 'быть', 'будет', 'было', 'сегодня', 'завтра', 'вчера',
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'this', 'that', 'these', 'those', 'it', 'its', 'you',
  'your', 'we', 'they', 'he', 'she', 'not', 'no', 'so', 'just', 'very', 'more', 'most', 'my', 'me', 'us',
  'from', 'as', 'by', 'about', 'into', 'out', 'up', 'down', 'all', 'some', 'any', 'will', 'would', 'can',
]);

export interface ExtractKeywordsOptions {
  /** Terms to skip — typically the post's own explicit hashtags, already scored separately. */
  exclude?: Set<string>;
  /** Max keywords returned, ranked by frequency then length. */
  limit?: number;
}

/** Tokenizes `text`, drops stopwords/short tokens/pure numbers, and returns the top N by frequency. */
export function extractKeywords(text: string, opts: ExtractKeywordsOptions = {}): string[] {
  const { exclude, limit = 8 } = opts;
  if (!text) return [];

  const tokens = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && t.length <= 24 && !/^\d+$/.test(t));

  const freq = new Map<string, number>();
  for (const tok of tokens) {
    if (STOPWORDS.has(tok)) continue;
    if (exclude?.has(tok)) continue;
    freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([term]) => term);
}
