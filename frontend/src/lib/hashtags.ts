import { HASHTAG_RE } from './tagRules'

/** Extracts lowercase, deduplicated hashtag names written inline in post text (e.g. "...#furry #digitalart"). */
export function extractHashtags(content: string): string[] {
  const found = content.match(HASHTAG_RE);
  if (!found) return [];
  return Array.from(new Set(found.map((h) => h.slice(1).toLowerCase())));
}

/**
 * Hashtags the user has *finished* typing — excludes whatever word is still under the cursor
 * (the trailing non-whitespace chunk), so "#f", "#fu", "#fur"... don't each get committed as a
 * separate tag while "#furry" is still being typed. Use this for live (on-input) auto-tagging;
 * use `extractHashtags` for a final pass right before submit, once typing is done.
 */
export function extractCommittedHashtags(content: string): string[] {
  if (content === '' || /\s$/.test(content)) return extractHashtags(content);
  const trailing = content.match(/\S+$/);
  const text = trailing ? content.slice(0, content.length - trailing[0].length) : content;
  return extractHashtags(text);
}
