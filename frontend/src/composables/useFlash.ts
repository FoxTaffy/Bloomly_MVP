import { ref } from 'vue'

export type FlashType = 'ok' | 'err'

/** Короткое всплывающее сообщение (см. components/ui/FlashToast.vue) — вместо alert(). */
export function useFlash(ms = 4000) {
  const flash = ref<{ type: FlashType; text: string } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function show(type: FlashType, text: string) {
    clearTimeout(timer)
    flash.value = { type, text }
    timer = setTimeout(() => { flash.value = null }, ms)
  }
  function dispose() { clearTimeout(timer) }

  return { flash, show, ok: (t: string) => show('ok', t), err: (t: string) => show('err', t), dispose }
}
