import { onScopeDispose, watch, type Ref } from 'vue'

interface InfiniteScrollOptions {
  /** Невидимый элемент в конце списка: как только он подъезжает к экрану, подгружаем следующую порцию. */
  target: Ref<HTMLElement | null>
  /** Можно ли сейчас грузить (не идёт загрузка, есть что грузить, нет ошибки). */
  canLoad: () => boolean
  load: () => void
  /** За сколько до края начинать (px) — подгрузка успевает до того, как пользователь упрётся в конец. */
  margin?: number
}

/**
 * Бесконечная прокрутка на IntersectionObserver вместо слушателя `scroll` на window.
 * Observer сообщает только о смене видимости, поэтому после каждой загрузки, если маркер всё ещё
 * на экране (короткая страница, высокий монитор, отфильтрованные посты), подгрузку нужно повторить
 * самим — это делает watch на canLoad.
 */
export function useInfiniteScroll({ target, canLoad, load, margin = 600 }: InfiniteScrollOptions) {
  let visible = false
  let observer: IntersectionObserver | null = null

  const tick = () => {
    if (visible && canLoad()) load()
  }

  watch(
    target,
    (element) => {
      observer?.disconnect()
      observer = null
      visible = false
      if (!element || typeof IntersectionObserver === 'undefined') return
      observer = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting
          tick()
        },
        { rootMargin: `0px 0px ${margin}px 0px` },
      )
      observer.observe(element)
    },
    { immediate: true, flush: 'post' },
  )
  watch(canLoad, tick)

  onScopeDispose(() => observer?.disconnect())
  return { tick }
}
