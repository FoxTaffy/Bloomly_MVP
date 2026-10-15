import { computed, onUnmounted, ref } from 'vue'
import api from '@/api'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import { deviceKind } from '@/lib/deviceIcon'

/** Online / last-seen / device of the other side of a DM, polled every 30s. */
export function usePartnerPresence(partnerId: () => string | undefined) {
  const langStore = useLangStore()
  const isPartnerOnline = ref(false)
  const partnerLastSeenAt = ref<Date | null>(null)
  const partnerDevice = ref<string | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null

  const partnerLastSeenLabel = computed(() => {
    const t = langStore.t
    if (!partnerLastSeenAt.value) return t.chatOfflineLabel
    const seenAt = partnerLastSeenAt.value
    const diff = Math.floor((Date.now() - seenAt.getTime()) / 60000)
    if (diff < 1) return t.chatOnlineJustNow
    if (diff < 60) return `${t.chatSeenPrefix} ${diff} ${t.chatMinAgoSuffix}`
    const h = Math.floor(diff / 60)
    if (h < 24) return `${t.chatSeenPrefix} ${h} ${t.chatHoursAgoSuffix}`
    const now = new Date()
    const locale = LANG_TO_LOCALE[langStore.currentLang]
    const time = seenAt.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    const sameYear = seenAt.getFullYear() === now.getFullYear()
    const date = seenAt.toLocaleDateString(locale, sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })
    return `${t.chatSeenPrefix} ${date} ${t.chatSeenAtConnector} ${time}`
  })

  const partnerDeviceIcon = computed(() => {
    const kind = deviceKind(partnerDevice.value)
    return kind === 'mobile' ? 'Smartphone' : kind === 'tablet' ? 'Tablet' : kind === 'desktop' ? 'Monitor' : null
  })

  async function fetchOnlineStatus() {
    const id = partnerId()
    if (!id) return
    try {
      const res = await api.get(`/users/online?ids=${id}`)
      const wasOnline = isPartnerOnline.value
      isPartnerOnline.value = !!res.data?.data?.[id]
      partnerDevice.value = res.data?.deviceData?.[id] ?? null
      if (isPartnerOnline.value) {
        partnerLastSeenAt.value = null
      } else if (wasOnline) {
        partnerLastSeenAt.value = new Date()
      } else {
        const lastSeen = res.data?.lastSeenData?.[id]
        partnerLastSeenAt.value = lastSeen ? new Date(lastSeen) : null
      }
    } catch { /* silent */ }
  }

  function startPolling() {
    fetchOnlineStatus()
    if (!timer) timer = setInterval(fetchOnlineStatus, 30_000)
  }

  function resetPresence() {
    isPartnerOnline.value = false
    partnerLastSeenAt.value = null
    partnerDevice.value = null
  }

  onUnmounted(() => { if (timer) clearInterval(timer) })

  return { isPartnerOnline, partnerDevice, partnerLastSeenLabel, partnerDeviceIcon, fetchOnlineStatus, startPolling, resetPresence }
}
