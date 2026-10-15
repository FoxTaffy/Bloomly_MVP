/** Prisma `where` fragment that excludes content containing any of the viewer's muted keywords. */
export function muteKeywordsWhere(keywords: string[]) {
  if (!keywords.length) return {};
  return { NOT: { OR: keywords.map((kw) => ({ content: { contains: kw, mode: 'insensitive' as const } })) } };
}

/**
 * Viewer's NSFW preference. `hide` drops NSFW posts in the query, `blur` and `show` both return
 * them (the client blurs for `blur`). Attachments carry no flag of their own (Post.media_urls is a
 * plain array), so they follow the post's `is_nsfw` — hiding the post hides its media too.
 */
export type NsfwMode = 'hide' | 'blur' | 'show';

const NSFW_MODES: readonly string[] = ['hide', 'blur', 'show'];

/**
 * The single place that turns request input into an effective mode. Non-adults (and guests) are
 * always `hide`, whatever they send. Accepts the new `nsfw` param and the legacy boolean `safeMode`
 * (`true` → hide, `false` → show); with neither present the safe default `hide` applies.
 */
export function resolveNsfwMode(input: { nsfw?: unknown; safeMode?: unknown; isAdult: boolean }): NsfwMode {
  if (!input.isAdult) return 'hide';
  if (typeof input.nsfw === 'string' && NSFW_MODES.includes(input.nsfw)) return input.nsfw as NsfwMode;
  if (input.safeMode === true || input.safeMode === 'true') return 'hide';
  if (input.safeMode === false || input.safeMode === 'false') return 'show';
  return 'hide';
}

/** Prisma `where` fragment for Post queries; belongs in the query itself so skip/take pagination stays correct. */
export function nsfwWhere(mode: NsfwMode) {
  return mode === 'hide' ? { is_nsfw: false } : {};
}
