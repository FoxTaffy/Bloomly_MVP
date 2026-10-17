import prisma from '../config/prisma.js';
import { normalizeTag } from './tagRules.js';

/**
 * Синонимы хештегов. Теги в постах остаются такими, как их ввёл автор; синонимы только
 * объединяют их в популярных тегах и (по желанию) в поиске.
 *  • автоматически: варианты, отличающиеся лишь «_» и «-» (furry_art / furry-art / furryart);
 *  • вручную: пары alias → canonical из админки (лиса → fox, арт → art).
 */

/** Ключ группы автоматических вариантов: тег без «_» и «-». */
export function tagKey(name: string): string {
  return normalizeTag(name).replace(/[_-]/g, '');
}

const CACHE_TTL_MS = 60_000;
let cache: { at: number; aliasToCanonical: Map<string, string> } | null = null;

/** alias-ключ → canonical-тег. Кэшируется на минуту; админка сбрасывает кэш при изменениях. */
async function synonymMap(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.aliasToCanonical;
  const rows = await prisma.tagSynonym.findMany({ select: { alias: true, canonical: true } });
  const map = new Map<string, string>();
  for (const r of rows) map.set(tagKey(r.alias), r.canonical);
  cache = { at: Date.now(), aliasToCanonical: map };
  return map;
}

export function invalidateTagSynonyms() { cache = null; }

/** Ключ группы с учётом ручных синонимов: ключ канонического тега. */
export async function groupKeyOf(name: string): Promise<string> {
  const map = await synonymMap();
  const key = tagKey(name);
  const canonical = map.get(key);
  return canonical ? tagKey(canonical) : key;
}

/**
 * Для SQL-группировки популярных тегов: ключ-варианта → ключ группы (только для тегов,
 * у которых есть ручной синоним) и ключ группы → отображаемое имя (канонический тег).
 */
export async function synonymGroups(): Promise<{ keyToGroup: Record<string, string>; groupName: Map<string, string> }> {
  const map = await synonymMap();
  const keyToGroup: Record<string, string> = {};
  const groupName = new Map<string, string>();
  for (const [aliasKey, canonical] of map) {
    const group = tagKey(canonical);
    keyToGroup[aliasKey] = group;
    keyToGroup[group] = group;
    groupName.set(group, canonical);
  }
  return { keyToGroup, groupName };
}

/** Все теги из базы, равнозначные данному (сам тег, его варианты и все синонимы его группы). */
export async function expandTag(name: string): Promise<string[]> {
  const normalized = normalizeTag(name);
  if (!normalized) return [];
  const map = await synonymMap();
  const group = await groupKeyOf(normalized);
  const keys = new Set<string>([group, tagKey(normalized)]);
  for (const [aliasKey, canonical] of map) if (tagKey(canonical) === group) keys.add(aliasKey);

  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM "Tag" WHERE regexp_replace(name, '[_-]', '', 'g') = ANY(${[...keys]})
  `;
  const names = new Set(rows.map((r) => r.name));
  names.add(normalized);
  return [...names];
}
