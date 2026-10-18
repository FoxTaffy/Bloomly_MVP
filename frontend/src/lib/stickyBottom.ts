import type { Directive } from 'vue'

// Как во ВКонтакте: колонка скроллится вместе со страницей, пока не покажется её низ,
// после чего «прилипает» нижним краем к окну. Если колонка короче окна — липнет сверху.
const TOP = 96 // top-24
const GAP = 16

const update = (el: HTMLElement) => {
  const top = Math.min(TOP, window.innerHeight - el.offsetHeight - GAP)
  el.style.top = `${top}px`
}

const cleanups = new WeakMap<HTMLElement, () => void>()

export const vStickyBottom: Directive<HTMLElement> = {
  mounted(el) {
    const fn = () => update(el)
    const ro = new ResizeObserver(fn)
    ro.observe(el)
    window.addEventListener('resize', fn)
    cleanups.set(el, () => { ro.disconnect(); window.removeEventListener('resize', fn) })
    fn()
  },
  unmounted(el) { cleanups.get(el)?.(); cleanups.delete(el) },
}
