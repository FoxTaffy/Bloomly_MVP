import { ref, type Ref } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'

/** Подсказка для @упоминания: человек (друзья — первыми) или группа. */
export type MentionItem = {
  type: 'user' | 'group'
  id: string
  slug: string        // username или slug группы — то, что вставится после «@»
  name: string
  sub: string
  avatar_url: string | null
  friend?: boolean
}

// «@» в начале или после не-словесного символа (не e-mail), дальше — допустимые символы ника (как на сервере: @\w+(-\w+)*)
const TRIGGER_RE = /(^|[^\w@])@([\w-]{0,30})$/
const MAX_ITEMS = 8
const FRIENDS_TTL_MS = 60_000

type FriendRow = { id: string; username: string; display_name: string | null; avatar_url: string | null; online?: boolean }
let friendsCache: { userId: string; at: number; list: FriendRow[] } | null = null
let friendsPending: Promise<FriendRow[]> | null = null

/** Список друзей для подсказок — свой маленький кэш, чтобы не трогать фильтры страницы «Друзья». */
async function loadFriends(userId: string): Promise<FriendRow[]> {
  if (friendsCache && friendsCache.userId === userId && Date.now() - friendsCache.at < FRIENDS_TTL_MS) return friendsCache.list
  if (friendsPending) return friendsPending
  friendsPending = api.get('/friends')
    .then((r) => {
      const list: FriendRow[] = Array.isArray(r.data?.data) ? r.data.data : []
      friendsCache = { userId, at: Date.now(), list }
      return list
    })
    .catch(() => [])
    .finally(() => { friendsPending = null })
  return friendsPending
}

const userItem = (u: FriendRow, friend: boolean): MentionItem => ({
  type: 'user', id: u.id, slug: u.username, name: u.display_name || u.username, sub: `@${u.username}`, avatar_url: u.avatar_url ?? null, friend,
})

/** Друзья → остальные люди → группы. Пустой запрос (только «@») — сразу друзья. */
export async function suggestMentions(query: string, viewerId: string | undefined): Promise<MentionItem[]> {
  const q = query.toLowerCase()
  const friends = viewerId ? await loadFriends(viewerId) : []
  const score = (u: FriendRow) => {
    const name = u.username.toLowerCase(), display = (u.display_name ?? '').toLowerCase()
    if (!q) return u.online ? 0 : 1
    if (name.startsWith(q) || display.startsWith(q)) return 0
    if (name.includes(q) || display.includes(q)) return 1
    return -1
  }
  const friendItems = friends
    .map((u) => ({ u, s: score(u) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .slice(0, 6)
    .map((x) => userItem(x.u, true))
  if (!q) return friendItems

  const [usersRes, groupsRes] = await Promise.all([
    api.get('/users/search', { params: { q } }).catch(() => null),
    api.get('/groups', { params: { search: q, limit: 3 } }).catch(() => null),
  ])
  const seen = new Set(friendItems.map((i) => i.id))
  const users = ((usersRes?.data?.data?.users ?? []) as FriendRow[])
    .filter((u) => u.id !== viewerId && !seen.has(u.id))
    .map((u) => userItem(u, false))
  const groups: MentionItem[] = ((groupsRes?.data?.data?.groups ?? []) as any[]).slice(0, 3).map((g) => ({
    type: 'group', id: g.id, slug: g.slug, name: g.name, sub: `@${g.slug}`, avatar_url: g.avatar_url ?? null,
  }))
  const people = [...friendItems, ...users].slice(0, MAX_ITEMS - Math.min(groups.length, 2))
  return [...people, ...groups].slice(0, MAX_ITEMS)
}

/**
 * Автодополнение @упоминаний для любого textarea/input: следит за набором «@…» перед курсором,
 * показывает подсказки и вставляет «@ник » на место набранного.
 * onKeydown возвращает true, если клавишу обработало открытое меню (Enter не должен отправлять форму).
 */
export function useMentionInput(text: Ref<string>, field: Ref<HTMLTextAreaElement | HTMLInputElement | null>) {
  const auth = useAuthStore()
  const open = ref(false)
  const items = ref<MentionItem[]>([])
  const active = ref(0)
  let start = -1
  let timer: ReturnType<typeof setTimeout> | null = null
  let request = 0

  function close() {
    open.value = false
    items.value = []
    if (timer) { clearTimeout(timer); timer = null }
    request++
  }

  function onInput() {
    const el = field.value
    if (!el) return
    const cursor = el.selectionStart ?? el.value.length
    const match = el.value.slice(0, cursor).match(TRIGGER_RE)
    if (!match) { close(); return }
    start = cursor - match[2].length - 1
    const query = match[2]
    if (timer) clearTimeout(timer)
    const id = ++request
    timer = setTimeout(async () => {
      const found = await suggestMentions(query, auth.user?.id)
      if (id !== request) return
      items.value = found
      active.value = 0
      open.value = found.length > 0
    }, query ? 150 : 0)
  }

  function pick(item: MentionItem | undefined) {
    const el = field.value
    if (!item || !el || start < 0) return
    const cursor = el.selectionStart ?? el.value.length
    const value = el.value
    const insert = `@${item.slug} `
    text.value = value.slice(0, start) + insert + value.slice(cursor)
    const caret = start + insert.length
    close()
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(caret, caret) })
  }

  function onKeydown(e: KeyboardEvent): boolean {
    if (!open.value || !items.value.length) return false
    if (e.key === 'ArrowDown') { e.preventDefault(); active.value = (active.value + 1) % items.value.length; return true }
    if (e.key === 'ArrowUp') { e.preventDefault(); active.value = (active.value - 1 + items.value.length) % items.value.length; return true }
    if ((e.key === 'Enter' && !e.shiftKey && !e.isComposing) || e.key === 'Tab') { e.preventDefault(); pick(items.value[active.value]); return true }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return true }
    return false
  }

  // Клик по пункту меню приходит раньше blur — закрываем с небольшой задержкой
  function onBlur() { setTimeout(close, 150) }

  return { open, items, active, onInput, onKeydown, onBlur, pick, close }
}
