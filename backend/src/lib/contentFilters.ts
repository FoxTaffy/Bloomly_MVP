/** Prisma `where` fragment that excludes content containing any of the viewer's muted keywords. */
export function muteKeywordsWhere(keywords: string[]) {
  if (!keywords.length) return {};
  return { NOT: { OR: keywords.map((kw) => ({ content: { contains: kw, mode: 'insensitive' as const } })) } };
}
