<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import BIcon from './BIcon.vue'
import PostComments from './PostComments.vue'
import CustomPlayer from './CustomPlayer.vue'

const props = defineProps<{
  images: string[]
  originalImages?: string[]
  startIndex?: number
  postId?: string
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const showComments = ref(!!props.postId)
const isVideo = (url: string) => /\.(mp4|webm|mov|mkv|ogv)$/i.test(url.split('?')[0])

const current = ref(props.startIndex ?? 0)
const total = computed(() => props.images.length)
const currentUrl = computed(() => props.images[current.value])
const currentOriginalUrl = computed(() => props.originalImages?.[current.value] || currentUrl.value)

const downloading = ref(false)
async function downloadOriginal() {
  const url = currentOriginalUrl.value
  downloading.value = true
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = url.split('/').pop() || 'image'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(blobUrl)
  } catch {
    window.open(url, '_blank')
  } finally {
    downloading.value = false
  }
}

const prev = () => { current.value = (current.value - 1 + total.value) % total.value }
const next = () => { current.value = (current.value + 1) % total.value }

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'ArrowRight') next()
  if (e.key === 'c' && props.postId) showComments.value = !showComments.value
}

const onWheel = (e: WheelEvent) => {
  if (showComments.value) return
  e.preventDefault()
  if (e.deltaY > 0 || e.deltaX > 0) next()
  else prev()
}

// Touch swipe support
let touchStartX = 0
const onTouchStart = (e: TouchEvent) => { touchStartX = e.touches[0].clientX }
const onTouchEnd = (e: TouchEvent) => {
  const diff = touchStartX - e.changedTouches[0].clientX
  if (Math.abs(diff) > 50) diff > 0 ? next() : prev()
}

onMounted(() => {
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})
onUnmounted(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-[300] flex overflow-hidden" @wheel.prevent="onWheel">
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/95" @click.self="emit('close')" />

      <!-- ── Media panel ─────────────────────────────────────────────── -->
      <div
        class="relative z-10 flex flex-col items-center justify-center transition-all duration-300 flex-shrink-0"
        :class="showComments ? 'w-full md:w-[60%]' : 'w-full'"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <!-- Top bar -->
        <div class="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          <div v-if="total > 1" class="px-3 py-1 rounded-full bg-black/60 border border-white/10 text-white text-sm font-bold backdrop-blur-sm pointer-events-auto">
            {{ current + 1 }}&thinsp;/&thinsp;{{ total }}
          </div>
          <div v-else />
          <div class="flex items-center gap-2 pointer-events-auto">
            <!-- Toggle comments -->
            <button
              v-if="postId"
              @click="showComments = !showComments"
              class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-sm font-semibold transition-all backdrop-blur-sm"
              :class="showComments
                ? 'bg-brand-accent/20 border-brand-accent/50 text-brand-accent'
                : 'bg-black/50 border-white/15 text-white hover:bg-black/70'"
              :title="showComments ? 'Скрыть комментарии (C)' : 'Комментарии (C)'"
            >
              <BIcon name="MessageSquare" class="w-4 h-4" />
              <BIcon
                :name="showComments ? 'ChevronRight' : 'ChevronLeft'"
                class="w-3.5 h-3.5 transition-transform"
              />
            </button>
            <!-- Download original -->
            <button
              v-if="!isVideo(currentUrl)"
              @click="downloadOriginal"
              :disabled="downloading"
              class="w-9 h-9 rounded-full bg-black/60 border border-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors disabled:opacity-50"
              title="Скачать оригинал"
            >
              <BIcon name="Download" class="w-4.5 h-4.5" />
            </button>
            <!-- Close -->
            <button
              @click="emit('close')"
              class="w-9 h-9 rounded-full bg-black/60 border border-white/15 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors"
            >
              <BIcon name="X" class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Media -->
        <div class="lightbox-media-wrap" @click.self="emit('close')">
          <CustomPlayer
            :key="currentUrl"
            :src="currentUrl"
            @click-image="() => {}"
          />
        </div>

        <!-- Prev -->
        <button
          v-if="total > 1"
          @click="prev"
          class="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white border border-white/15 transition-colors"
        >
          <BIcon name="ChevronLeft" class="w-6 h-6" />
        </button>

        <!-- Next -->
        <button
          v-if="total > 1"
          @click="next"
          class="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-black/50 hover:bg-black/80 flex items-center justify-center text-white border border-white/15 transition-colors"
        >
          <BIcon name="ChevronRight" class="w-6 h-6" />
        </button>

        <!-- Thumbs strip -->
        <div v-if="total > 1" class="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
          <button
            v-for="(url, idx) in images"
            :key="idx"
            @click="current = idx"
            class="w-12 h-12 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-all"
            :class="idx === current ? 'border-brand-accent scale-105' : 'border-white/20 opacity-50 hover:opacity-80'"
          >
            <img v-if="!isVideo(url)" :src="url" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full bg-brand-bg/60 flex items-center justify-center">
              <BIcon name="Play" class="w-4 h-4 text-white" />
            </div>
          </button>
        </div>
      </div>

      <!-- ── Comments panel ──────────────────────────────────────────── -->
      <Transition name="comments-panel">
        <div
          v-if="showComments && postId"
          class="relative z-10 md:w-[40%] w-full bg-brand-card border-l border-brand-border flex flex-col overflow-hidden flex-shrink-0"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-brand-border flex-shrink-0 bg-brand-card">
            <div class="flex items-center gap-2 font-bold text-white">
              <BIcon name="MessageSquare" class="w-5 h-5 text-brand-accent" />
              Комментарии
            </div>
            <button
              @click="showComments = false"
              class="w-8 h-8 rounded-full bg-brand-bg hover:bg-brand-border flex items-center justify-center text-white/55 hover:text-white transition-colors"
            >
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <!-- Scrollable body -->
          <div class="flex-1 overflow-y-auto px-4 pb-6">
            <PostComments :post-id="postId" />
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
/* Медиа-обёртка в лайтбоксе */
.lightbox-media-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 16px 72px;
  box-sizing: border-box;
  overflow: hidden;
}
/* CustomPlayer (изображение) --- вписываем по contain */
.lightbox-media-wrap :deep(> img) {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.7);
  cursor: default;
}
/* CustomPlayer (video wrapper) --- полная ширина */
.lightbox-media-wrap :deep(> div) {
  width: 100%;
  max-height: 100%;
}

.comments-panel-enter-active,
.comments-panel-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease, width 0.25s ease;
}
.comments-panel-enter-from,
.comments-panel-leave-to {
  opacity: 0;
  transform: translateX(40px);
}
.comments-panel-enter-to,
.comments-panel-leave-from {
  opacity: 1;
  transform: translateX(0);
}
</style>
