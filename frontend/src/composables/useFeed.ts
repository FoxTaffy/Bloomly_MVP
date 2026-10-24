import { computed, onScopeDispose, reactive, ref, watch, type Ref } from 'vue'
import api from '@/api'
import { useFollowState } from '@/composables/useFollowState'
import {
  FEED_SORT_OPTIONS, appendUnique, checkNewParams, chunk, feedUrl, isAbortError, isFeedSort, isRenderablePost,
  isSortableMode, newestTimestamp, type FeedMode, type FeedSort,
} from '@/lib/feed'

const SORT_KEY = 'bloomly_feed_sort'
const NEW_POSTS_POLL_MS = 60_000
// Сервер принимает не больше 100 id за запрос
const STATUS_BATCH = 100

function readStoredSort(): FeedSort {
  try {
    const saved = localStorage.getItem(SORT_KEY)
    if (isFeedSort(saved)) return saved
  } catch { /* хранилище недоступно — по умолчанию новые */ }
  return 'new'
}

export interface PostViewerState { repawed: boolean; favourited: boolean; userVote: 1 | -1 | 0 }

/**
 * Лента: вкладки, сортировка, страницы, «Новые посты», состояние «я лайкнул / подписан».
 *
 * Каждая загрузка помечена номером поколения (`generation`): ответ, пришедший после смены вкладки,
 * сортировки или NSFW-режима, отбрасывается, а его запрос отменяется через AbortController.
 * Раньше устаревший ответ молча подмешивался в новую вкладку.
 */
export function useFeed(nsfwMode: Ref<string>, mode: Ref<FeedMode> = ref<FeedMode>('for-you')) {
  const follows = useFollowState()

  const sort = ref<FeedSort>(readStoredSort())
  const posts = ref<any[]>([])
  const viewerState = reactive<Record<string, PostViewerState>>({})

  const isLoading = ref(true)
  const isLoadingMore = ref(false)
  const hasMore = ref(true)
  /** 'initial' — не загрузилась вкладка целиком, 'more' — не подгрузилась очередная страница. */
  const loadError = ref<'initial' | 'more' | null>(null)
  const newPostsCount = ref(0)

  const sortable = computed(() => isSortableMode(mode.value))

  let generation = 0
  let page = 1
  // Курсор следующей страницы от сервера: undefined — сервер его не отдал (откат на номер страницы), null — лента кончилась
  let cursor: string | null | undefined

  interface FeedPage { posts: any[]; nextCursor?: string | null }
  let controller: AbortController | null = null
  let lastCheck = Date.now()
  let pollTimer: ReturnType<typeof setInterval> | null = null

  const request = (pageNumber: number, after?: string | null) =>
    feedUrl({ mode: mode.value, page: pageNumber, nsfw: nsfwMode.value, sort: sort.value, cursor: after })

  async function fetchPage(pageNumber: number, after?: string | null, signal?: AbortSignal): Promise<FeedPage> {
    const res = await api.get(request(pageNumber, after), { signal })
    if (!res.data.success) throw new Error('feed request failed')
    return { posts: res.data.data.posts ?? [], nextCursor: res.data.data.nextCursor }
  }

  /** Есть ли ещё страницы: решает сервер (nextCursor), а без него — пустой ли был ответ. */
  const moreAfter = (result: FeedPage) => (result.nextCursor === undefined ? result.posts.length > 0 : result.nextCursor !== null)

  // ── Состояние «я лайкнул / подписан» для показанных постов ─────────────────
  async function loadViewerState(list: any[], gen: number) {
    const ids = list.map((post) => post.id as string)
    for (const part of chunk(ids, STATUS_BATCH)) {
      try {
        const res = await api.get('/posts/status', { params: { ids: part.join(',') } })
        if (gen !== generation) return
        if (res.data.success) {
          for (const s of res.data.data) {
            viewerState[s.id] = { repawed: !!s.repawed, favourited: !!s.favourited, userVote: s.userVote ?? 0 }
          }
        }
      } catch { /* не критично: карточка покажет нейтральное состояние */ }
    }
    const authorIds = list.map((post) => post.author?.id as string | undefined).filter((id): id is string => !!id)
    await follows.load(authorIds)
  }

  // ── Загрузка ───────────────────────────────────────────────────────────────
  async function reload() {
    controller?.abort()
    controller = new AbortController()
    const gen = ++generation
    page = 1
    cursor = undefined
    isLoading.value = true
    isLoadingMore.value = false
    hasMore.value = true
    loadError.value = null
    // Состояние прошлой выдачи не должно копиться: оно нужно только показанным постам
    for (const id of Object.keys(viewerState)) delete viewerState[id]
    try {
      const result = await fetchPage(1, null, controller.signal)
      if (gen !== generation) return
      posts.value = result.posts.filter(isRenderablePost)
      cursor = result.nextCursor
      hasMore.value = moreAfter(result)
      newPostsCount.value = 0
      lastCheck = Date.now()
      void loadViewerState(posts.value, gen)
    } catch (error) {
      if (gen !== generation || isAbortError(error)) return
      posts.value = []
      loadError.value = 'initial'
    } finally {
      if (gen === generation) isLoading.value = false
    }
  }

  async function loadMore() {
    if (isLoading.value || isLoadingMore.value || !hasMore.value || loadError.value) return
    const gen = generation
    const next = page + 1
    isLoadingMore.value = true
    try {
      const result = await fetchPage(next, cursor, controller?.signal)
      if (gen !== generation) return
      // Позицию двигаем только после успеха: иначе при сбое страница терялась бы навсегда
      page = next
      cursor = result.nextCursor
      hasMore.value = moreAfter(result)
      const fresh = result.posts.filter(isRenderablePost)
      if (!fresh.length) return
      posts.value = appendUnique(posts.value, fresh)
      void loadViewerState(fresh, gen)
    } catch (error) {
      if (gen !== generation || isAbortError(error)) return
      loadError.value = 'more'
    } finally {
      if (gen === generation) isLoadingMore.value = false
    }
  }

  /** Повтор после ошибки — того, что не загрузилось. */
  function retry() {
    const failed = loadError.value
    loadError.value = null
    return failed === 'more' ? loadMore() : reload()
  }

  // ── Свежесть ленты ─────────────────────────────────────────────────────────
  // Раз в минуту и при возврате на вкладку тихо проверяем первую страницу; если есть посты новее
  // самого свежего из показанных — не двигаем ленту под пальцем, а показываем плашку «Новые посты».
  async function checkNew() {
    if (isLoading.value || isLoadingMore.value || loadError.value) return
    // «Новые посты» имеют смысл только при сортировке по дате (новые сверху)
    if (sortable.value && sort.value !== 'new') return
    const newest = newestTimestamp(posts.value)
    if (!newest) return
    lastCheck = Date.now()
    const gen = generation
    try {
      // Сервер отдаёт только число: раньше для проверки каждую минуту тянулась целая страница ленты
      const res = await api.get('/posts/check-new', { params: checkNewParams({ mode: mode.value, nsfw: nsfwMode.value, since: newest }) })
      if (gen !== generation || !res.data.success) return
      newPostsCount.value = res.data.data.count
    } catch { /* следующая проверка через минуту */ }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > NEW_POSTS_POLL_MS) void checkNew()
  }

  function startWatching() {
    stopWatching()
    pollTimer = setInterval(() => { if (document.visibilityState === 'visible') void checkNew() }, NEW_POSTS_POLL_MS)
    document.addEventListener('visibilitychange', onVisibilityChange)
    if (Date.now() - lastCheck > NEW_POSTS_POLL_MS) void checkNew()
  }
  function stopWatching() {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = null
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  // ── Локальные правки списка ────────────────────────────────────────────────
  const prepend = (post: any) => { posts.value = [post, ...posts.value.filter((p) => p.id !== post.id)] }
  const remove = (id: string) => { posts.value = posts.value.filter((p) => p.id !== id) }
  const replace = (post: any) => {
    const index = posts.value.findIndex((p) => p.id === post.id)
    if (index !== -1) posts.value[index] = post
  }
  const stateOf = (id: string): PostViewerState => viewerState[id] ?? { repawed: false, favourited: false, userVote: 0 }

  // Смена вкладки, NSFW-режима или (на сортируемых вкладках) сортировки — новая выдача
  watch([mode, nsfwMode, () => (sortable.value ? sort.value : null)], () => { void reload() })
  watch(sort, (value) => { try { localStorage.setItem(SORT_KEY, value) } catch { /* не критично */ } })

  onScopeDispose(() => { generation++; controller?.abort(); stopWatching() })

  return {
    mode, sort, sortOptions: FEED_SORT_OPTIONS, sortable,
    posts, isLoading, isLoadingMore, hasMore, loadError, newPostsCount,
    followStatus: follows.following,
    reload, loadMore, retry, checkNew, startWatching, stopWatching,
    prepend, remove, replace, stateOf,
  }
}
