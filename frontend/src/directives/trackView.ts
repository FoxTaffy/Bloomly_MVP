import type { ObjectDirective } from 'vue'
import { useAnalytics } from '@/composables/useAnalytics'

const { observePost } = useAnalytics()
const stops = new WeakMap<HTMLElement, () => void>()

/**
 * v-track-view="postId": засчитывает просмотр поста, когда карточка какое-то время была на экране.
 * Подписка снимается вместе с элементом (удалили пост, сменили вкладку) — раньше observer
 * оставался жить, пока не перезагрузят всю ленту.
 */
export const vTrackView: ObjectDirective<HTMLElement, string> = {
  mounted(element, binding) {
    if (binding.value) stops.set(element, observePost(element, binding.value))
  },
  unmounted(element) {
    stops.get(element)?.()
    stops.delete(element)
  },
}
