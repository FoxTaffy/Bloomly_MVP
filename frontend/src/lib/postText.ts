export type PostSeg =
  | { type: 'text'; key: number; text: string }
  | { type: 'mention'; key: number; text: string; username: string }
  | { type: 'url'; key: number; text: string; href: string }

const TOKEN_RE = /(https?:\/\/[^\s<]+|@\w+(?:-\w+)*)/g
const TRAILING_PUNCT_RE = /[.,!?;:)\]}»"'…]+$/

/** Splits post text into plain text, @mentions and clickable http(s) links. */
export function parsePostSegments(text: string): PostSeg[] {
  const segs: PostSeg[] = []
  let key = 0
  for (const part of text.split(TOKEN_RE)) {
    if (!part) continue
    if (/^https?:\/\//.test(part)) {
      // Trailing sentence punctuation ("...help.") is not part of the link
      const trail = part.match(TRAILING_PUNCT_RE)?.[0] ?? ''
      const url = trail ? part.slice(0, -trail.length) : part
      segs.push({ type: 'url', key: key++, text: url, href: url })
      if (trail) segs.push({ type: 'text', key: key++, text: trail })
    } else if (/^@\w+(?:-\w+)*$/.test(part)) {
      segs.push({ type: 'mention', key: key++, text: part, username: part.slice(1) })
    } else {
      segs.push({ type: 'text', key: key++, text: part })
    }
  }
  return segs
}
