import { computed, onScopeDispose, reactive, watch } from 'vue'
import api from '@/api'

type Vote = -1 | 0 | 1
interface Discussion {
  comments: any[]
  votes: Record<string, Vote>
  canModerate: boolean
  loading: boolean
  loadedAt: number
  error: string
  draft: string
  submitting: boolean
  total: number | null
  lastSeed: number | null
  users: number
  pending: Promise<void> | null
}
const discussions = new Map<string, Discussion>()
function storageKey(key: string) { return `bloomly-comment-draft:${key}` }
function entry(key: string): Discussion {
  let state = discussions.get(key)
  if (!state) {
    let draft = ''
    try { draft = sessionStorage.getItem(storageKey(key)) ?? '' } catch { /* Memory remains available. */ }
    state = reactive({ comments: [], votes: {}, canModerate: false, loading: false, loadedAt: 0, error: '', draft,
      submitting: false, total: null, lastSeed: null, users: 0, pending: null }) as Discussion
    discussions.set(key, state)
  }
  return state
}

/** Shares the existing comments API state between the feed and its full-window view. */
export function usePostDiscussion(postId: () => string, userId: () => string | undefined) {
  const key = computed(() => `${userId() ?? 'guest'}:${postId()}`)
  const state = computed(() => entry(key.value))
  const release = (oldKey: string) => {
    const old = discussions.get(oldKey)
    if (old) old.users = Math.max(0, old.users - 1)
    if (discussions.size > 80) for (const [name, value] of discussions) {
      if (!value.users && !value.loading && !value.submitting) discussions.delete(name)
      if (discussions.size <= 60) break
    }
  }
  watch(key, (next, previous) => {
    if (previous) release(previous)
    entry(next).users++
  }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => release(key.value))
  const bind = <K extends keyof Discussion>(name: K) => computed({
    get: () => state.value[name], set: (value: Discussion[K]) => { state.value[name] = value },
  })
  const draft = computed({ get: () => state.value.draft, set: (value: string) => {
    state.value.draft = value
    try { if (value) sessionStorage.setItem(storageKey(key.value), value); else sessionStorage.removeItem(storageKey(key.value)) } catch { /* Private storage. */ }
  } })
  async function load(force = false) {
    const target = state.value
    if (target.pending) return target.pending
    if (!force && target.loadedAt && Date.now() - target.loadedAt < 30_000) return
    const id = postId()
    target.loading = true
    target.error = ''
    const request = (async () => {
      try {
        const response = await api.get(`/posts/${id}/comments`)
        if (!response.data.success) throw new Error('Comments unavailable')
        const incoming = response.data.data.comments ?? []
        // Keep comments sent while the initial GET was in flight.
        const known = new Set(incoming.map((item: any) => item.id))
        const concurrent = target.comments.filter(item => item.__local && !known.has(item.id))
        target.comments = [...concurrent, ...incoming]
        target.canModerate = !!response.data.data.canModerate
        for (const item of incoming.flatMap((comment: any) => [comment, ...(comment.replies ?? [])])) {
          const vote = item.user_vote ?? item.userVote
          if (vote === 1 || vote === -1 || vote === 0) target.votes[item.id] = vote
        }
        if (target.total === null) target.total = target.comments.reduce((n, item) => n + 1 + (item.replies?.length ?? 0), 0)
        target.loadedAt = Date.now()
      } catch {
        target.error = 'Не удалось загрузить комментарии. Проверьте соединение и повторите.'
      } finally { target.loading = false; target.pending = null }
    })()
    target.pending = request
    return request
  }
  function seedCount(value?: number, onlyEmpty = false) {
    if (value === undefined || (onlyEmpty && state.value.total !== null)) return
    if (state.value.total === null || state.value.lastSeed !== value) {
      state.value.total = Math.max(0, value)
      state.value.lastSeed = value
    }
  }
  function adjustCount(delta: number) { state.value.total = Math.max(0, (state.value.total ?? 0) + delta) }
  return { state, comments: bind('comments'), votes: bind('votes'), canModerate: bind('canModerate'),
    loading: bind('loading'), error: bind('error'), submitting: bind('submitting'), draft,
    count: computed(() => state.value.total ?? 0), load, seedCount, adjustCount }
}
