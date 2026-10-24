import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

const get = vi.fn()
vi.mock('@/api', () => ({ default: { get: (...args: unknown[]) => get(...args) } }))
vi.mock('@/composables/useFollowState', () => ({ useFollowState: () => ({ following: {}, load: async () => {}, toggle: async () => {}, reset: () => {} }) }))

import { useFeed } from '@/composables/useFeed'

const post = (id: string) => ({ id, author: { id: `u-${id}` }, created_at: '2026-01-01T00:00:00Z' })
const page = (...ids: string[]) => ({ data: { success: true, data: { posts: ids.map(post) } } })
const statusReply = { data: { success: true, data: [] } }

/** Ответ, который отдаётся вручную — чтобы проверять порядок «пришёл позже запроса». */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function mountFeed() {
  const nsfw = ref('hide')
  const scope = effectScope()
  const feed = scope.run(() => useFeed(nsfw))!
  return { feed, nsfw, scope }
}

const feedCalls = () => get.mock.calls.map((c) => String(c[0])).filter((url) => !url.startsWith('/posts/status'))

beforeEach(() => {
  get.mockReset()
  get.mockImplementation((url: string) => (url.startsWith('/posts/status') ? Promise.resolve(statusReply) : Promise.reject(new Error(`unexpected ${url}`))))
})

describe('useFeed: пагинация', () => {
  it('грузит страницы по порядку и склеивает без повторов', async () => {
    const { feed } = mountFeed()
    get.mockImplementation((url: string) => {
      if (url.startsWith('/posts/status')) return Promise.resolve(statusReply)
      return Promise.resolve(url.includes('page=1') ? page('a', 'b') : page('b', 'c'))
    })
    await feed.reload()
    await feed.loadMore()
    expect(feed.posts.value.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect(feedCalls()).toEqual(['/posts/personalized?page=1&nsfw=hide', '/posts/personalized?page=2&nsfw=hide'])
  })

  it('пустая страница заканчивает ленту, дальше запросов нет', async () => {
    const { feed } = mountFeed()
    get.mockImplementation((url: string) => (url.startsWith('/posts/status') ? Promise.resolve(statusReply) : Promise.resolve(url.includes('page=1') ? page('a') : page())))
    await feed.reload()
    await feed.loadMore()
    expect(feed.hasMore.value).toBe(false)
    await feed.loadMore()
    expect(feedCalls()).toHaveLength(2)
  })

  it('сбой подгрузки не теряет страницу: повтор просит ту же', async () => {
    const { feed } = mountFeed()
    let failNext = false
    get.mockImplementation((url: string) => {
      if (url.startsWith('/posts/status')) return Promise.resolve(statusReply)
      if (url.includes('page=1')) return Promise.resolve(page('a'))
      if (failNext) { failNext = false; return Promise.reject(new Error('network')) }
      return Promise.resolve(page('b'))
    })
    await feed.reload()
    failNext = true
    await feed.loadMore()
    expect(feed.loadError.value).toBe('more')
    // пока ошибка не снята, подгрузка не запускается снова сама (иначе бесконечный цикл запросов)
    await feed.loadMore()
    expect(feedCalls().filter((u) => u.includes('page=2'))).toHaveLength(1)
    await feed.retry()
    expect(feed.posts.value.map((p) => p.id)).toEqual(['a', 'b'])
    expect(feedCalls().filter((u) => u.includes('page=2'))).toHaveLength(2)
    expect(feedCalls().some((u) => u.includes('page=3'))).toBe(false)
  })

  it('посты без автора отфильтрованы, но пустая после фильтра страница не обрывает ленту', async () => {
    const { feed } = mountFeed()
    get.mockImplementation((url: string) => {
      if (url.startsWith('/posts/status')) return Promise.resolve(statusReply)
      return Promise.resolve({ data: { success: true, data: { posts: [{ id: 'x', author: null }] } } })
    })
    await feed.reload()
    expect(feed.posts.value).toEqual([])
    expect(feed.hasMore.value).toBe(true)
  })
})

describe('useFeed: курсор', () => {
  const withCursor = (cursor: string | null, ...ids: string[]) => ({ data: { success: true, data: { posts: ids.map(post), nextCursor: cursor } } })

  it('следующая страница просится по nextCursor, без номера; null — конец ленты без лишнего запроса', async () => {
    const { feed } = mountFeed()
    get.mockImplementation((url: string) => {
      if (url.startsWith('/posts/status')) return Promise.resolve(statusReply)
      if (url.includes('cursor=c1')) return Promise.resolve(withCursor('c2', 'c'))
      if (url.includes('cursor=c2')) return Promise.resolve(withCursor(null, 'd'))
      return Promise.resolve(withCursor('c1', 'a', 'b'))
    })
    await feed.reload()
    await feed.loadMore()
    await feed.loadMore()
    expect(feed.posts.value.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(feed.hasMore.value).toBe(false)
    await feed.loadMore()
    expect(feedCalls()).toEqual([
      '/posts/personalized?page=1&nsfw=hide',
      '/posts/personalized?nsfw=hide&cursor=c1',
      '/posts/personalized?nsfw=hide&cursor=c2',
    ])
  })

  it('страница, целиком состоящая из уже показанных постов, не обрывает ленту, если сервер сказал «есть ещё»', async () => {
    const { feed } = mountFeed()
    get.mockImplementation((url: string) => {
      if (url.startsWith('/posts/status')) return Promise.resolve(statusReply)
      if (url.includes('cursor=c1')) return Promise.resolve(withCursor('c2', 'a'))
      if (url.includes('cursor=c2')) return Promise.resolve(withCursor(null, 'b'))
      return Promise.resolve(withCursor('c1', 'a'))
    })
    await feed.reload()
    await feed.loadMore()
    expect(feed.hasMore.value).toBe(true)
    await feed.loadMore()
    expect(feed.posts.value.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('сбой подгрузки повторяется с тем же курсором', async () => {
    const { feed } = mountFeed()
    let fail = true
    get.mockImplementation((url: string) => {
      if (url.startsWith('/posts/status')) return Promise.resolve(statusReply)
      if (url.includes('cursor=c1')) {
        if (fail) { fail = false; return Promise.reject(new Error('network')) }
        return Promise.resolve(withCursor(null, 'b'))
      }
      return Promise.resolve(withCursor('c1', 'a'))
    })
    await feed.reload()
    await feed.loadMore()
    expect(feed.loadError.value).toBe('more')
    await feed.retry()
    expect(feed.posts.value.map((p) => p.id)).toEqual(['a', 'b'])
    expect(feedCalls().filter((u) => u.includes('cursor=c1'))).toHaveLength(2)
  })

  it('смена вкладки сбрасывает курсор прошлой ленты', async () => {
    const { feed } = mountFeed()
    get.mockImplementation((url: string) => (url.startsWith('/posts/status') ? Promise.resolve(statusReply) : Promise.resolve(withCursor('c1', 'a'))))
    await feed.reload()
    feed.mode.value = 'news'
    await vi.waitFor(() => expect(feedCalls().length).toBe(2))
    await vi.waitFor(() => expect(feed.isLoading.value).toBe(false))
    await feed.loadMore()
    expect(feedCalls().at(-1)).toBe('/posts?nsfw=hide&cursor=c1&sort=new')
  })
})

describe('useFeed: гонки запросов', () => {
  it('ответ прошлой вкладки не попадает в новую', async () => {
    const { feed } = mountFeed()
    const slow = deferred<ReturnType<typeof page>>()
    get.mockImplementation((url: string) => {
      if (url.startsWith('/posts/status')) return Promise.resolve(statusReply)
      return url.startsWith('/posts/personalized') ? slow.promise : Promise.resolve(page('news-1'))
    })
    const first = feed.reload()
    feed.mode.value = 'news'
    await nextTick()
    await vi.waitFor(() => expect(feed.posts.value.map((p) => p.id)).toEqual(['news-1']))
    slow.resolve(page('for-you-1'))
    await first
    expect(feed.posts.value.map((p) => p.id)).toEqual(['news-1'])
    expect(feed.isLoading.value).toBe(false)
  })

  it('подгрузка, начатая до смены вкладки, не дописывается в новую выдачу', async () => {
    const { feed } = mountFeed()
    const slowMore = deferred<ReturnType<typeof page>>()
    get.mockImplementation((url: string) => {
      if (url.startsWith('/posts/status')) return Promise.resolve(statusReply)
      if (url.startsWith('/posts/personalized')) return url.includes('page=1') ? Promise.resolve(page('a')) : slowMore.promise
      return Promise.resolve(page('news-1'))
    })
    await feed.reload()
    const more = feed.loadMore()
    feed.mode.value = 'news'
    await vi.waitFor(() => expect(feed.posts.value.map((p) => p.id)).toEqual(['news-1']))
    slowMore.resolve(page('late'))
    await more
    expect(feed.posts.value.map((p) => p.id)).toEqual(['news-1'])
    expect(feed.isLoadingMore.value).toBe(false)
  })

  it('сортировка перезагружает только сортируемые вкладки', async () => {
    const { feed } = mountFeed()
    get.mockImplementation((url: string) => (url.startsWith('/posts/status') ? Promise.resolve(statusReply) : Promise.resolve(page('a'))))
    await feed.reload()
    const before = feedCalls().length
    feed.sort.value = 'hot-week' // «Для вас» не сортируется
    await nextTick()
    expect(feedCalls()).toHaveLength(before)
    feed.mode.value = 'news'
    await nextTick()
    await vi.waitFor(() => expect(feedCalls().length).toBeGreaterThan(before))
    expect(feedCalls().at(-1)).toContain('sort=hot&period=week')
  })

  it('провал первой загрузки показывает ошибку, а повтор её снимает', async () => {
    const { feed } = mountFeed()
    get.mockImplementationOnce(() => Promise.reject(new Error('offline')))
    await feed.reload()
    expect(feed.loadError.value).toBe('initial')
    expect(feed.isLoading.value).toBe(false)
    get.mockImplementation((url: string) => (url.startsWith('/posts/status') ? Promise.resolve(statusReply) : Promise.resolve(page('a'))))
    await feed.retry()
    expect(feed.loadError.value).toBeNull()
    expect(feed.posts.value).toHaveLength(1)
  })
})
