// Pure helpers for rendering chat messages (no component state).
import type { Message } from '@/stores/messages'
import { isEncrypted } from '@/lib/e2e'

// Legacy built-in sticker keys → emoji
const STICKER_MAP: Record<string, string> = {
  'sticker:fluffy:f1': '🐻', 'sticker:fluffy:f2': '🐨', 'sticker:fluffy:f3': '🦥',
  'sticker:fluffy:f4': '🐰', 'sticker:fluffy:f5': '🐼', 'sticker:fluffy:f6': '🦊',
  'sticker:fluffy:f7': '🐯', 'sticker:fluffy:f8': '🐻‍❄️', 'sticker:fluffy:f9': '🐕',
  'sticker:fluffy:f10': '🦝', 'sticker:fluffy:f11': '🦦', 'sticker:fluffy:f12': '🦜',
  'sticker:fursona:fu1': '🦊', 'sticker:fursona:fu2': '🐺', 'sticker:fursona:fu3': '🐲',
  'sticker:fursona:fu4': '🦄', 'sticker:fursona:fu5': '🐆', 'sticker:fursona:fu6': '😺',
  'sticker:fursona:fu7': '🐅', 'sticker:fursona:fu8': '🦈',
}
export function getStickerEmoji(key: string): string { return STICKER_MAP[key] ?? '🎭' }

// Matches only emoji / ZWJ sequences / variation selectors / flag pairs / whitespace
const EMOJI_ONLY_RE = /^[\p{Extended_Pictographic}‍️\u{1F1E6}-\u{1F1FF}\s]+$/u
export function isEmojiOnlyText(text: string | undefined | null): boolean {
  if (!text) return false
  const trimmed = text.trim()
  if (!trimmed || !EMOJI_ONLY_RE.test(trimmed)) return false
  const segmenter = (Intl as any).Segmenter ? new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' }) : null
  const count = segmenter ? Array.from(segmenter.segment(trimmed)).length : Array.from(trimmed).length
  return count >= 1 && count <= 3
}

export const FWD_RE = /^↩️ Переслано от (.+?)\n/
// Format v2 (JSON): story_reply:{"img":...,"exp":...,"name":...,"ava":...} + newline + reply
// Format v1 (legacy pipe): story_reply:IMAGE_URL|EXPIRES_AT|AUTHOR_NAME|AUTHOR_AVATAR + newline + reply
export const STORY_REPLY_RE = /^\[story_reply:(\{[\s\S]*?\}|[^\]]*)\]\n?([\s\S]*)$/u

export interface StoryReplyMeta {
  imageUrl: string
  expiresAt: string
  authorName: string
  authorAvatar: string
  replyText: string
  expired: boolean
}

type ParsedStoryReply = { fields: Omit<StoryReplyMeta, 'expired'>; forcedExpired: boolean } | null

// The template calls parseStoryReply(msg) up to a dozen times per story-reply row
// (once per v-if/attribute binding). Regex + JSON.parse on every one of those, on
// every re-render of the message list, adds up fast in long chats — so the parse
// itself is cached per message; only the cheap expiry check re-runs on each call.
const storyReplyCache = new Map<string, ParsedStoryReply>()

export function parseStoryReply(msg: Message): StoryReplyMeta | null {
  const cacheKey = `${msg.id}|${msg.text ?? ''}`
  let cached = storyReplyCache.get(cacheKey)
  if (cached === undefined) {
    cached = parseStoryReplyUncached(msg)
    storyReplyCache.set(cacheKey, cached)
  }
  if (!cached) return null
  const expired = cached.forcedExpired || (cached.fields.expiresAt ? Date.now() > new Date(cached.fields.expiresAt).getTime() : false)
  return { ...cached.fields, expired }
}

function parseStoryReplyUncached(msg: Message): ParsedStoryReply {
  const m = (msg.text || '').match(STORY_REPLY_RE)
  if (!m) return null
  const raw = m[1]
  let imageUrl = '', expiresAt = '', authorName = '', authorAvatar = ''
  if (raw.startsWith('{')) {
    // v2 JSON format
    try {
      const j = JSON.parse(raw)
      imageUrl    = j.img  ?? ''
      expiresAt   = j.exp  ?? ''
      authorName  = j.name ?? ''
      authorAvatar = j.ava ?? ''
    } catch {
      // JSON malformed — show as expired card with fallback sender info
      return {
        fields: { imageUrl: '', expiresAt: '', authorName: msg.sender?.display_name || msg.sender?.username || '', authorAvatar: msg.sender?.avatar_url || '', replyText: '' },
        forcedExpired: true,
      }
    }
  } else {
    // v1 pipe format (legacy fallback)
    const parts = raw.split('|')
    imageUrl     = parts[0] ?? ''
    expiresAt    = parts[1] ?? ''
    authorName   = parts[2] ?? ''
    authorAvatar = parts[3] ?? ''
  }
  return { fields: { imageUrl, expiresAt, authorName, authorAvatar, replyText: m[2].trim() }, forcedExpired: false }
}

/** Message text as shown to the user; legacy E2E ciphertext becomes a placeholder label. */
export function getDisplayText(msg: Message, encryptedLabel: string): string {
  const text = msg.text
  if (!text) return ''
  // Legacy messages encrypted before E2E was removed — no key to decrypt them anymore
  if (isEncrypted(text)) return encryptedLabel
  return text
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function renderMentions(text: string): string {
  if (!text) return ''
  return escapeHtml(text).replace(/@([\w.-]+)/g, '<span class="mention-link text-brand-accent cursor-pointer hover:underline" data-username="$1">@$1</span>')
}

/** Escapes text and wraps every occurrence of `query` in a <mark>. */
export function highlightMatches(text: string, query: string): string {
  if (!query) return escapeHtml(text)
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const chunks: string[] = []
  let offset = 0
  for (const match of text.matchAll(new RegExp(escapedQuery, 'gi'))) {
    const start = match.index!
    chunks.push(escapeHtml(text.slice(offset, start)))
    chunks.push(`<mark class="bg-brand-accent/30 text-white rounded px-0.5">${escapeHtml(match[0])}</mark>`)
    offset = start + match[0].length
  }
  chunks.push(escapeHtml(text.slice(offset)))
  return chunks.join('')
}

export interface AlbumFile { url: string; type: string }
export function getAlbumFiles(msg: Message): AlbumFile[] {
  const files = msg.metadata?.files
  return Array.isArray(files) ? files : []
}

export function isGifUrl(url?: string | null): boolean {
  return !!url && /\.gif(\?|$)/i.test(url)
}

export function formatMoney(amount: number | undefined): string {
  if (!amount && amount !== 0) return ''
  return new Intl.NumberFormat('ru-RU').format(amount) + ' ₽'
}

export function isOverdue(deadline: string | undefined): boolean {
  return !!deadline && new Date(deadline).getTime() < Date.now()
}

export function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
