import { perksFor } from '../modules/payments/plan-perks.js';

/** Оценка textScore одного слова при точном совпадении (display_name считается с коэффициентом 0.9). */
const EXACT_PER_TERM = 9;
/** Точное совпадение всегда выше любых неточных, как бы ни был силён тариф. */
const EXACT_BONUS = 100;

/**
 * Итоговая оценка результата поиска (людей, групп, лотов): релевантность + приоритет тарифа.
 * Тариф (Pro +4, Business +6) выводит автора выше среди сопоставимых совпадений, но не затмевает запрос:
 * точное совпадение имени получает отдельный большой бонус и остаётся впереди неточных у любого тарифа,
 * а при равной релевантности Business > Pro > остальные.
 */
export function searchScore(relevance: number, termCount: number, tier: string): number {
  const exact = relevance >= termCount * EXACT_PER_TERM;
  return relevance + (exact ? EXACT_BONUS : 0) + perksFor(tier).searchBonus;
}
