import { ref } from 'vue'

export interface ConfirmOptions {
  title?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  visible: boolean
  message: string
}

const state = ref<ConfirmState>({
  visible: false,
  message: '',
})

let resolvePromise: ((value: boolean) => void) | null = null

function settle(value: boolean) {
  state.value.visible = false
  resolvePromise?.(value)
  resolvePromise = null
}

/** Promise-based replacement for window.confirm(), backed by the site's own modal (mounted once in App.vue). */
export function useConfirm() {
  function confirmDialog(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    settle(false)
    state.value = { visible: true, message, ...options }
    return new Promise((resolve) => {
      resolvePromise = resolve
    })
  }

  return { state, confirmDialog, resolve: settle }
}
