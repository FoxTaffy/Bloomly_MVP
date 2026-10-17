import type { ObjectDirective } from 'vue'

const listeners = new WeakMap<HTMLElement, EventListener>()
export const clickOutside: ObjectDirective<HTMLElement, (event: Event) => void> = {
  mounted(element, binding) {
    const listener: EventListener = event => {
      if (!event.composedPath().includes(element)) binding.value(event)
    }
    listeners.set(element, listener)
    document.addEventListener('pointerdown', listener, true)
  },
  updated(element, binding) {
    const previous = listeners.get(element)
    if (previous) document.removeEventListener('pointerdown', previous, true)
    const listener: EventListener = event => {
      if (!event.composedPath().includes(element)) binding.value(event)
    }
    listeners.set(element, listener)
    document.addEventListener('pointerdown', listener, true)
  },
  unmounted(element) {
    const listener = listeners.get(element)
    if (listener) document.removeEventListener('pointerdown', listener, true)
    listeners.delete(element)
  },
}
