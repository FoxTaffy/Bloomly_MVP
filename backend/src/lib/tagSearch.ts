import prisma from '../config/prisma.js';
import { expandTag } from './tagSynonyms.js';
import { likeEscape, trigramAvailable, type SearchTerm } from './searchQuery.js';

/**
 * Теги, подходящие под слово запроса, с оценкой: точное совпадение > синоним > начало > вхождение > опечатка.
 * Исправленная раскладка (variants) ищется наравне с исходным словом.
 */
export async function resolveTagsForTerm(term: SearchTerm, withSynonyms: boolean): Promise<Map<string, number>> {
  const words = [term.text, ...term.variants];
  const scores = new Map<string, number>();
  const bump = (name: string, score: number) => {
    if (score > (scores.get(name) ?? 0)) scores.set(name, score);
  };

  // Одна буква — только начало тега, иначе «а» находило бы половину базы.
  const patterns = words.map((w) => (w.length >= 2 ? `%${likeEscape(w)}%` : `${likeEscape(w)}%`));
  const rows = await prisma.$queryRaw<{ name: string }[]>`
    SELECT name FROM "Tag" WHERE name ILIKE ANY(${patterns}) LIMIT 200
  `;
  for (const { name } of rows) {
    for (const w of words) {
      if (name === w) bump(name, 10);
      else if (name.startsWith(w)) bump(name, 8);
      else if (w.length >= 2 && name.includes(w)) bump(name, 4);
    }
  }

  if (withSynonyms) {
    for (const w of words) {
      for (const name of await expandTag(w)) bump(name, name === w ? 10 : 9);
    }
  }

  if (await trigramAvailable()) {
    for (const w of words.filter((x) => x.length >= 3)) {
      const fuzzy = await prisma.$queryRaw<{ name: string; sim: number }[]>`
        SELECT name, similarity(name, ${w}) AS sim FROM "Tag" WHERE name % ${w} ORDER BY sim DESC LIMIT 20
      `.catch(() => []);
      for (const { name, sim } of fuzzy) if (sim >= 0.4) bump(name, sim * 6);
    }
  }
  return scores;
}
