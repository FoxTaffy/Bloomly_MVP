import { computed, ref } from 'vue'
import { useMessagesStore } from '@/stores/messages'
import { useLangStore } from '@/stores/lang'

/** Per-type media counters (photos, videos, files…) shown in the chat info panels. */
export function useChatMediaStats(convId: () => string) {
  const store = useMessagesStore()
  const langStore = useLangStore()

  const mediaStatsData = ref<Record<string, number>>({})
  const mediaStatsLoading = ref(false)
  const MEDIA_STAT_DEFS = computed(() => [
    { key: 'image',  label: langStore.t.chatMediaLabelPhoto,  icon: 'Image' },
    { key: 'video',  label: langStore.t.chatMediaLabelVideo,  icon: 'Video' },
    { key: 'audio',  label: langStore.t.chatMediaLabelAudio,  icon: 'Music' },
    { key: 'voice',  label: langStore.t.chatMediaLabelVoice,  icon: 'Mic' },
    { key: 'file',   label: langStore.t.chatMediaLabelFiles,  icon: 'FileText' },
    { key: 'link',   label: langStore.t.chatMediaLabelLinks,  icon: 'Link' },
  ])
  const mediaStatsList = computed(() =>
    MEDIA_STAT_DEFS.value.map(d => ({ ...d, count: mediaStatsData.value[d.key] ?? 0 })),
  )
  async function loadMediaStats() {
    if (mediaStatsLoading.value) return
    mediaStatsLoading.value = true
    try { mediaStatsData.value = await store.getMediaStats(convId()) } finally { mediaStatsLoading.value = false }
  }

  return { mediaStatsList, mediaStatsLoading, loadMediaStats }
}
