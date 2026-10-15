<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMessagesStore, type Message } from '@/stores/messages'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'
import * as fmt from '@/lib/format'

const PAGE_SIZE = 60

// Paged list of one media type (photo/video/audio/voice/links) of a conversation, grouped by month.
const props = defineProps<{ convId: string; type: string | null }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'open-image', urls: string[], start: number): void }>()
const store = useMessagesStore()
const langStore = useLangStore()

const MEDIA_TYPE_TITLES = computed<Record<string, string>>(() => ({
  image: langStore.t.chatMediaTitlePhotos, video: langStore.t.chatMediaLabelVideo, audio: langStore.t.chatMediaTitleAudioFiles,
  voice: langStore.t.chatMediaTitleVoiceMessages, link: langStore.t.chatMediaLabelLinks,
}))
const mediaBrowserItems = ref<Message[]>([])
const mediaBrowserLoading = ref(false)
const mediaBrowserHasMore = ref(true)
const mediaBrowserPlayingId = ref<string | null>(null)

async function loadMoreMediaBrowser() {
  if (!props.type || mediaBrowserLoading.value || !mediaBrowserHasMore.value) return
  mediaBrowserLoading.value = true
  try {
    const items = mediaBrowserItems.value
    const before = items.length ? items[items.length - 1].created_at : undefined
    const batch = await store.getMediaMessages(props.convId, props.type, before)
    mediaBrowserItems.value.push(...batch)
    if (batch.length < PAGE_SIZE) mediaBrowserHasMore.value = false
  } finally {
    mediaBrowserLoading.value = false
  }
}

// (Re)start from the first page whenever a type is opened
watch(() => props.type, (type) => {
  mediaBrowserItems.value = []
  mediaBrowserHasMore.value = true
  mediaBrowserPlayingId.value = null
  if (type) loadMoreMediaBrowser()
}, { immediate: true })

function onMediaBrowserScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 150) loadMoreMediaBrowser()
}

const locale = () => LANG_TO_LOCALE[langStore.currentLang]
const formatMsgTime = (iso: string) => fmt.formatClock(iso, locale())
function monthLabel(iso: string): string {
  const d = new Date(iso)
  const month = d.toLocaleDateString(locale(), { month: 'long' })
  const capped = month.charAt(0).toUpperCase() + month.slice(1)
  return d.getFullYear() === new Date().getFullYear() ? capped : `${capped} ${d.getFullYear()}`
}
const mediaBrowserGroups = computed(() => {
  const groups: Array<{ label: string; items: Message[] }> = []
  for (const m of mediaBrowserItems.value) {
    const label = monthLabel(m.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(m)
    else groups.push({ label, items: [m] })
  }
  return groups
})
function toggleMediaBrowserPlay(msgId: string) {
  mediaBrowserPlayingId.value = mediaBrowserPlayingId.value === msgId ? null : msgId
}
function openMediaBrowserImage(url: string) {
  const urls = mediaBrowserItems.value.map((m) => m.file_url).filter(Boolean) as string[]
  emit('open-image', urls, Math.max(0, urls.indexOf(url)))
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="type" class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md" @click.self="emit('close')">
        <div class="bg-brand-card border border-brand-border rounded-3xl shadow-2xl w-full max-w-sm flex flex-col overflow-hidden" style="max-height:90vh">
          <!-- Header -->
          <div class="flex items-center gap-2 px-2 py-3 border-b border-brand-border flex-shrink-0">
            <button @click="emit('close')" class="w-8 h-8 rounded-xl hover:bg-brand-bg flex items-center justify-center text-white/70 hover:text-white transition-all flex-shrink-0">
              <BIcon name="ArrowLeft" class="w-4 h-4" />
            </button>
            <h3 class="flex-1 min-w-0 text-sm font-bold text-white truncate">{{ MEDIA_TYPE_TITLES[type] ?? '' }}</h3>
            <button @click="emit('close')" class="w-8 h-8 rounded-xl hover:bg-brand-bg flex items-center justify-center text-white/70 hover:text-white transition-all flex-shrink-0">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto min-h-0" @scroll="onMediaBrowserScroll">
            <p v-if="!mediaBrowserLoading && !mediaBrowserItems.length" class="text-center text-sm text-white/30 py-10">{{ langStore.t.chatNothingHere }}</p>

            <template v-for="group in mediaBrowserGroups" :key="group.label">
              <p class="px-4 pt-3 pb-1.5 text-xs font-bold text-white/40 uppercase tracking-wide">{{ group.label }}</p>

              <!-- Photos / videos: grid -->
              <div v-if="type === 'image' || type === 'video'" class="grid grid-cols-4 gap-0.5 px-0.5">
                <div v-for="m in group.items" :key="m.id" class="relative aspect-square cursor-pointer bg-black/30"
                  @click="type === 'image' ? openMediaBrowserImage(m.file_url!) : null">
                  <img v-if="m.type === 'image'" :src="m.file_url!" class="w-full h-full object-cover" loading="lazy" />
                  <video v-else :src="m.file_url!" class="w-full h-full object-cover" preload="metadata" />
                  <div v-if="m.type === 'video'" class="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                    <BIcon name="Play" class="w-5 h-5 text-white drop-shadow" />
                  </div>
                </div>
              </div>

              <!-- Audio / voice: list with inline play -->
              <div v-else-if="type === 'audio' || type === 'voice'">
                <div v-for="m in group.items" :key="m.id" class="flex items-center gap-3 px-4 py-2.5">
                  <audio v-if="mediaBrowserPlayingId === m.id" :src="m.file_url!" autoplay @ended="mediaBrowserPlayingId = null" class="hidden" />
                  <button @click="toggleMediaBrowserPlay(m.id)"
                    class="flex-shrink-0 w-9 h-9 rounded-full bg-brand-accent/80 hover:bg-brand-accent flex items-center justify-center transition-all">
                    <BIcon :name="mediaBrowserPlayingId === m.id ? 'Pause' : 'Play'" class="w-4 h-4 text-white" />
                  </button>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-white font-medium truncate">{{ m.sender?.display_name || m.sender?.username }}</p>
                    <p class="text-xs text-white/45">{{ formatMsgTime(m.created_at) }}</p>
                  </div>
                </div>
              </div>

              <!-- Links: text list -->
              <div v-else>
                <div v-for="m in group.items" :key="m.id" class="px-4 py-2.5">
                  <p class="text-xs text-brand-accent font-semibold">{{ m.sender?.display_name || m.sender?.username }}</p>
                  <p class="text-sm text-white/80 break-words">{{ m.text }}</p>
                  <p class="text-xs text-white/40 mt-0.5">{{ formatMsgTime(m.created_at) }}</p>
                </div>
              </div>
            </template>

            <div v-if="mediaBrowserLoading" class="flex items-center justify-center py-4 text-white/55 text-sm gap-2">
              <BIcon name="Loader2" class="w-4 h-4 animate-spin" /> {{ langStore.t.loadingBtn }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
