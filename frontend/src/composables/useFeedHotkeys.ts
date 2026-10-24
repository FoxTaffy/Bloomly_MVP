import { isTypingTarget, pickCardIndex } from '@/lib/feed'

// Классы выделения текущей карточки (outline, а не ring: у panel-card уже занят box-shadow)
const FOCUS_CLASSES = ['outline-2', 'outline-brand-accent/60', 'outline-offset-2']
const CARD_SELECTOR = '[data-feed-card]'
// Открытые окна и оверлеи: под ними лента не должна листаться с клавиатуры
const OVERLAY_SELECTOR = '[role="dialog"], [aria-modal="true"], .fixed.inset-0'

/**
 * Клавиатура в ленте: j — следующий пост, k — предыдущий, l — поставить плюс текущему.
 * Привязано к физическим клавишам (KeyJ/KeyK/KeyL), поэтому работает и в русской раскладке.
 * Карточки находит по `data-feed-card`, кнопку лайка — по `data-vote="up"` внутри карточки.
 */
export function useFeedHotkeys() {
  let focused: HTMLElement | null = null

  const cards = () => [...document.querySelectorAll<HTMLElement>(CARD_SELECTOR)]
  const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  /** Линия под шапкой: на неё выравниваются карточки (scroll-margin-top карточки). */
  const topLine = (card: HTMLElement) => parseFloat(getComputedStyle(card).scrollMarginTop) || 0
  const onScreen = (card: HTMLElement) => {
    const rect = card.getBoundingClientRect()
    return rect.bottom > topLine(card) && rect.top < window.innerHeight
  }

  function setFocused(card: HTMLElement | null) {
    focused?.classList.remove(...FOCUS_CLASSES)
    focused = card
    focused?.classList.add(...FOCUS_CLASSES)
  }

  function go(list: HTMLElement[], direction: 1 | -1) {
    if (!list.length) return
    let index: number | null
    const current = focused ? list.indexOf(focused) : -1
    // Если выделенная карточка ещё на экране, идём от неё: во время плавной прокрутки позиции «плывут»
    if (current !== -1 && onScreen(list[current])) {
      const next = current + direction
      index = next >= 0 && next < list.length ? next : null
    } else {
      const line = topLine(list[0])
      index = pickCardIndex(list.map((card) => card.getBoundingClientRect().top - line), direction)
    }
    if (index === null) return
    setFocused(list[index])
    list[index].scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  function like(list: HTMLElement[]) {
    const card = focused && list.includes(focused) && onScreen(focused)
      ? focused
      : list.find((c) => c.getBoundingClientRect().bottom > topLine(c) + 40)
    if (!card) return
    setFocused(card)
    card.querySelector<HTMLElement>('[data-vote="up"]')?.click()
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return
    if (e.code !== 'KeyJ' && e.code !== 'KeyK' && e.code !== 'KeyL') return
    if (isTypingTarget(e.target) || document.querySelector(OVERLAY_SELECTOR)) return
    const list = cards()
    if (e.code === 'KeyL') like(list)
    else go(list, e.code === 'KeyJ' ? 1 : -1)
  }

  return {
    activate() { document.addEventListener('keydown', onKeydown) },
    deactivate() { document.removeEventListener('keydown', onKeydown); setFocused(null) },
  }
}
