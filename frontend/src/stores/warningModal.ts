import { defineStore } from 'pinia'
import { ref } from 'vue'

// Shared across the header notification dropdown and the realtime toast so both
// can open the same violation-detail modal for an `automod_warn` notification.
export const useWarningModalStore = defineStore('warningModal', () => {
  const notif = ref<any | null>(null)

  const open = (n: any) => { notif.value = n }
  const close = () => { notif.value = null }

  return { notif, open, close }
})
