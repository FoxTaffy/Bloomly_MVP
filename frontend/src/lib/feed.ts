// Чистая логика ленты (без Vue и сети): адреса запросов, фильтрация и склейка страниц.
// Живёт отдельно от composables/useFeed.ts, чтобы проверяться обычными юнит-тестами.

export type FeedMode = 'for-you' | 'subscriptions' | 'news' | 'photos' | 'nsfw'
export type FeedSort = 'new' | 'old' | 'hot-day' | 'hot-week' | 'hot-month' | 'hot-all'

/** Вкладки ленты. `label` — ключ словаря langStore.t, а если ключа нет — сам текст. */
export const FEED_TABS: { mode: FeedMode; label: string; icon: string; nsfwOnly?: boolean }[] = [
  { mode: 'for-you', label: 'forYou', icon: 'Sparkles' },
  { mode: 'subscriptions', label: 'feedFollowing', icon: 'Rss' },
  { mode: 'news', label: 'feedGeneral', icon: 'Newspaper' },
  { mode: 'photos', label: 'feedPhoto', icon: 'Image' },
  { mode: 'nsfw', label: 'NSFW', icon: 'Flame', nsfwOnly: true },
]

// Сортировка общих вкладок (Общее, Фото, NSFW): новые / старые / лучшие за период.
export const FEED_SORT_OPTIONS: { value: FeedSort; label: string }[] = [
  { value: 'new', label: 'Сначала новые' },
  { value: 'old', label: 'Сначала старые' },
  { value: 'hot-day', label: 'Лучшие за сутки' },
  { value: 'hot-week', label: 'Лучшие за неделю' },
  { value: 'hot-month', label: 'Лучшие за месяц' },
  { value: 'hot-all', label: 'Лучшие за всё время' },
]

export const isFeedSort = (value: unknown): value is FeedSort =>
  FEED_SORT_OPTIONS.some((option) => option.value === value)

/** Сортируются только общие вкладки; «Для вас» и «Подписки» отдаются сервером в своём порядке. */
export const isSortableMode = (mode: FeedMode): boolean => mode === 'news' || mode === 'photos' || mode === 'nsfw'

export interface FeedRequest {
  mode: FeedMode
  page: number
  /** 'hide' | 'blur' | 'show' — режим NSFW из useNsfwMode */
  nsfw: string
  sort: FeedSort
  /** nextCursor прошлого ответа: с ним страница запрашивается «после последнего поста», а не по номеру */
  cursor?: string | null
}

export function feedUrl({ mode, page, nsfw, sort, cursor }: FeedRequest): string {
  const params = new URLSearchParams(cursor ? { nsfw, cursor } : { page: String(page), nsfw })
  const applySort = () => {
    const [by, period] = sort.split('-')
    params.set('sort', by)
    if (period) params.set('period', period)
  }
  switch (mode) {
    case 'for-you':
      return `/posts/personalized?${params}`
    case 'subscriptions':
      return `/follows/feed?${params}`
    case 'photos':
      params.set('hasMedia', 'true')
      applySort()
      return `/posts?${params}`
    case 'nsfw':
      params.set('nsfw', 'show')
      params.set('nsfwOnly', 'true')
      applySort()
      return `/posts?${params}`
    default:
      applySort()
      return `/posts?${params}`
  }
}

/**
 * Посты с удалёнными/null авторами не показываем — но не групповые: у них автор намеренно скрыт
 * бэкендом (maskGroupAuthor), это не значит «автор удалён».
 */
export const isRenderablePost = (post: any): boolean =>
  !!post && !!post.id && (!!post.author || (Array.isArray(post.groupPosts) && post.groupPosts.length > 0))

/** Лента сдвигается, пока пользователь читает, — отсекаем повторы на стыке страниц. */
export function appendUnique<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const known = new Set(existing.map((post) => post.id))
  const fresh = incoming.filter((post) => !known.has(post.id))
  return fresh.length ? [...existing, ...fresh] : existing
}

/** Время самого свежего поста из показанных (мс); 0, если дат нет. */
export const newestTimestamp = (posts: { created_at?: string }[]): number =>
  posts.reduce((max, post) => Math.max(max, new Date(post.created_at ?? 0).getTime() || 0), 0)

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Цвет из данных (группа/событие) идёт в inline-style, поэтому пропускаем только #RRGGBB. */
export const safeColor = (color: unknown, fallback = '#4C67CF'): string =>
  typeof color === 'string' && HEX_COLOR.test(color) ? color : fallback

/** Контекст группы для PostCard из поста (бэкенд кладёт его в groupPosts[0].group). */
export const groupContextOf = (post: any) => post?.groupPosts?.[0]?.group ?? null

export const isAbortError = (error: unknown): boolean =>
  (error as { code?: string })?.code === 'ERR_CANCELED' || (error as { name?: string })?.name === 'CanceledError'

/** Параметры GET /posts/check-new: сколько постов вкладки новее `since` (мс). Вкладка NSFW всегда в режиме show, как и сама выдача. */
export const checkNewParams = ({ mode, nsfw, since }: { mode: FeedMode; nsfw: string; since: number }) => ({
  mode,
  since: new Date(since).toISOString(),
  nsfw: mode === 'nsfw' ? 'show' : nsfw,
})

/** Вкладка из `?tab=`; неизвестное значение и NSFW без включённого режима игнорируются. */
export function parseFeedTab(value: unknown, nsfwEnabled: boolean): FeedMode | null {
  const tab = FEED_TABS.find((t) => t.mode === value)
  if (!tab || (tab.nsfwOnly && !nsfwEnabled)) return null
  return tab.mode
}

/** Вкладка по умолчанию не пишется в адрес — «/» остаётся чистым. */
export const DEFAULT_FEED_MODE: FeedMode = 'for-you'

/**
 * Клавиатурная навигация: к какой карточке прыгнуть. `tops` — верхние края карточек относительно
 * линии под шапкой (0 = карточка у верха). j — первая ниже линии, k — последняя выше неё;
 * допуск в несколько px, чтобы только что выровненная карточка не считалась «текущей снова».
 */
export function pickCardIndex(tops: number[], direction: 1 | -1, tolerance = 4): number | null {
  if (direction === 1) {
    const index = tops.findIndex((top) => top > tolerance)
    return index === -1 ? null : index
  }
  for (let i = tops.length - 1; i >= 0; i--) if (tops[i] < -tolerance) return i
  return null
}

/** Нажатие в поле ввода или на редактируемом элементе — горячие клавиши не трогаем. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el.tagName !== 'string') return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}
