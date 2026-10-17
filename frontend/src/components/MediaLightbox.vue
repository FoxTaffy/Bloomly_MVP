<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import BIcon from './BIcon.vue'

// Full-screen viewer for a list of media: arrows / ←→ keys / swipe to flip, Esc or backdrop to close.
const props = defineProps<{ urls: string[] }>()
const index = defineModel<number | null>('index', { required: true })

const isImage = (url: string) => /\.(jpe?g|png|gif|webp|avif|svg)(\?|$)/i.test(url)
const current = computed(() => (index.value === null ? null : props.urls[index.value] ?? null))

function close() { index.value = null }
function step(delta: number) {
  if (index.value === null || props.urls.length < 2) return
  index.value = (index.value + delta + props.urls.length) % props.urls.length
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.stopPropagation(); close() }
  else if (e.key === 'ArrowLeft') step(-1)
  else if (e.key === 'ArrowRight') step(1)
}
// Capture phase so Esc closes the viewer first, not the album modal underneath.
watch(current, (url) => {
  if (url) document.addEventListener('keydown', onKey, true)
  else document.removeEventListener('keydown', onKey, true)
}, { immediate: true })
onUnmounted(() => document.removeEventListener('keydown', onKey, true))

let touchX = 0, touchY = 0
function onTouchStart(e: TouchEvent) { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY }
function onTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchX
  const dy = e.changedTouches[0].clientY - touchY
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="current" class="fixed inset-0 z-[700] bg-black/95 flex items-center justify-center select-none"
      @click.self="close" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
      <img v-if="isImage(current)" :key="current" :src="current" alt="" class="max-w-[94vw] max-h-[90vh] object-contain" />
      <video v-else :key="current" :src="current" controls autoplay playsinline class="max-w-[94vw] max-h-[90vh]" />

      <button type="button" aria-label="Закрыть" @click="close"
        class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
        <BIcon name="X" class="w-5 h-5" />
      </button>
      <template v-if="urls.length > 1">
        <button type="button" aria-label="Назад" @click="step(-1)"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 hidden sm:flex items-center justify-center text-white">
          <BIcon name="ChevronLeft" class="w-6 h-6" />
        </button>
        <button type="button" aria-label="Вперёд" @click="step(1)"
          class="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 hidden sm:flex items-center justify-center text-white">
          <BIcon name="ChevronRight" class="w-6 h-6" />
        </button>
        <span class="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs font-semibold text-white/70 bg-black/50 px-2.5 py-1 rounded-full">
          {{ (index ?? 0) + 1 }} / {{ urls.length }}
        </span>
      </template>
    </div>
  </Teleport>
</template>
