import { ref } from 'vue'

/** Copy text to the clipboard and flip `copied` to true for a moment (for a ✓ icon). */
export function useCopyFeedback(ms = 1500) {
  const copied = ref(false)
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      copied.value = true
      setTimeout(() => { copied.value = false }, ms)
    } catch { /* clipboard blocked — silent */ }
  }
  return { copied, copy }
}
