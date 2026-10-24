import { describe, expect, it } from 'vitest'
import { appendUnique, chunk, feedUrl, groupContextOf, isAbortError, isRenderablePost, isSortableMode, newestTimestamp, safeColor } from '@/lib/feed'

describe('feedUrl', () => {
  const base = { page: 2, nsfw: 'hide', sort: 'new' as const }

  it('«Для вас» и «Подписки» идут на свои эндпоинты без сортировки', () => {
    expect(feedUrl({ ...base, mode: 'for-you' })).toBe('/posts/personalized?page=2&nsfw=hide')
    expect(feedUrl({ ...base, mode: 'subscriptions', sort: 'hot-week' })).toBe('/follows/feed?page=2&nsfw=hide')
  })

  it('общие вкладки передают сортировку и период', () => {
    expect(feedUrl({ ...base, mode: 'news' })).toBe('/posts?page=2&nsfw=hide&sort=new')
    expect(feedUrl({ ...base, mode: 'news', sort: 'hot-month' })).toBe('/posts?page=2&nsfw=hide&sort=hot&period=month')
    expect(feedUrl({ ...base, mode: 'photos', sort: 'old' })).toBe('/posts?page=2&nsfw=hide&hasMedia=true&sort=old')
  })

  it('вкладка NSFW всегда запрашивает nsfw=show и только NSFW-посты', () => {
    expect(feedUrl({ ...base, mode: 'nsfw', sort: 'hot-all' })).toBe('/posts?page=2&nsfw=show&nsfwOnly=true&sort=hot&period=all')
  })

  it('с курсором страница запрашивается «после последнего поста» — без номера', () => {
    expect(feedUrl({ ...base, mode: 'for-you', cursor: 'abc_-9' })).toBe('/posts/personalized?nsfw=hide&cursor=abc_-9')
    expect(feedUrl({ ...base, mode: 'news', cursor: 'abc' })).toBe('/posts?nsfw=hide&cursor=abc&sort=new')
    expect(feedUrl({ ...base, mode: 'subscriptions', cursor: null })).toBe('/follows/feed?page=2&nsfw=hide')
  })

  it('сортируются только общие вкладки', () => {
    expect(['for-you', 'subscriptions'].some((m) => isSortableMode(m as any))).toBe(false)
    expect(['news', 'photos', 'nsfw'].every((m) => isSortableMode(m as any))).toBe(true)
  })
})

describe('isRenderablePost', () => {
  it('отсекает посты без автора, но оставляет групповые', () => {
    expect(isRenderablePost({ id: '1', author: { id: 'u' } })).toBe(true)
    expect(isRenderablePost({ id: '2', author: null, groupPosts: [{ group: {} }] })).toBe(true)
    expect(isRenderablePost({ id: '3', author: null })).toBe(false)
    expect(isRenderablePost({ id: '4', author: null, groupPosts: [] })).toBe(false)
    expect(isRenderablePost(null)).toBe(false)
  })
})

describe('appendUnique / chunk / newestTimestamp', () => {
  it('склейка страниц не дублирует посты, сдвинувшиеся на стыке', () => {
    const merged = appendUnique([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }])
    expect(merged.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('если новых нет, возвращает тот же массив (без лишней реактивности)', () => {
    const list = [{ id: 'a' }]
    expect(appendUnique(list, [{ id: 'a' }])).toBe(list)
  })

  it('chunk делит список на части не больше размера', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })

  it('newestTimestamp берёт самую позднюю дату и терпит мусор', () => {
    expect(newestTimestamp([{ created_at: '2026-01-01T00:00:00Z' }, { created_at: '2026-03-01T00:00:00Z' }, { created_at: 'oops' }, {}]))
      .toBe(Date.parse('2026-03-01T00:00:00Z'))
    expect(newestTimestamp([])).toBe(0)
  })
})

describe('safeColor', () => {
  it('пропускает только #RRGGBB: цвет попадает в inline-style', () => {
    expect(safeColor('#4c67cf')).toBe('#4c67cf')
    expect(safeColor('red; background:url(//evil)')).toBe('#4C67CF')
    expect(safeColor('#fff')).toBe('#4C67CF')
    expect(safeColor(null)).toBe('#4C67CF')
    expect(safeColor(undefined, '#000000')).toBe('#000000')
  })
})

describe('прочее', () => {
  it('groupContextOf достаёт группу из groupPosts', () => {
    expect(groupContextOf({ groupPosts: [{ group: { id: 'g' } }] })).toEqual({ id: 'g' })
    expect(groupContextOf({})).toBeNull()
  })
  it('isAbortError узнаёт отмену axios', () => {
    expect(isAbortError({ code: 'ERR_CANCELED' })).toBe(true)
    expect(isAbortError(new Error('boom'))).toBe(false)
  })
})

describe('вкладка в адресе, check-new и клавиатура', () => {
  it('parseFeedTab пропускает только известные вкладки; NSFW — только при включённом режиме', async () => {
    const { parseFeedTab } = await import('@/lib/feed')
    expect(parseFeedTab('news', false)).toBe('news')
    expect(parseFeedTab('photos', false)).toBe('photos')
    expect(parseFeedTab('nsfw', false)).toBeNull()
    expect(parseFeedTab('nsfw', true)).toBe('nsfw')
    expect(parseFeedTab('<script>', true)).toBeNull()
    expect(parseFeedTab(['news'], true)).toBeNull()
    expect(parseFeedTab(undefined, true)).toBeNull()
  })

  it('checkNewParams: since в ISO, вкладка NSFW всегда в режиме show', async () => {
    const { checkNewParams } = await import('@/lib/feed')
    const since = Date.parse('2026-03-01T12:00:00.123Z')
    expect(checkNewParams({ mode: 'news', nsfw: 'blur', since })).toEqual({ mode: 'news', since: '2026-03-01T12:00:00.123Z', nsfw: 'blur' })
    expect(checkNewParams({ mode: 'nsfw', nsfw: 'hide', since }).nsfw).toBe('show')
  })

  it('pickCardIndex: j — первая карточка ниже линии, k — последняя выше неё', async () => {
    const { pickCardIndex } = await import('@/lib/feed')
    // карточка 1 выровнена по линии (top = 0), 2 и 3 ниже, 0 уже прокручена
    const tops = [-500, 0, 480, 960]
    expect(pickCardIndex(tops, 1)).toBe(2)
    expect(pickCardIndex(tops, -1)).toBe(0)
    expect(pickCardIndex([0, 400], -1)).toBeNull()
    expect(pickCardIndex([-900, -400], 1)).toBeNull()
    // посередине длинной карточки «назад» ведёт к её началу
    expect(pickCardIndex([-300, 700], -1)).toBe(0)
  })

  it('isTypingTarget не трогает поля ввода', async () => {
    const { isTypingTarget } = await import('@/lib/feed')
    expect(isTypingTarget({ tagName: 'TEXTAREA' } as any)).toBe(true)
    expect(isTypingTarget({ tagName: 'INPUT' } as any)).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true } as any)).toBe(true)
    expect(isTypingTarget({ tagName: 'BUTTON' } as any)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
