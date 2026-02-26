<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import BIcon from './BIcon.vue'

const props = defineProps<{
  images: string[]
  startIndex?: number
}>()

const emit = defineEmits<{ (e: 'close'): void }>()

const current = ref(props.startIndex ?? 0)
const total = computed(() => props.images.length)
const currentUrl = computed(() => props.images[current.value])

const prev = () => { current.value = (current.value - 1 + total.value) % total.value }
const next = () => { current.value = (current.value + 1) % total.value }

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'ArrowRight') next()
}

const onWheel = (e: WheelEvent) => {
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
    <div
      class="fixed inset-0 z-[300] bg-black/95 flex items-center justify-center"
      @click.self="emit('close')"
      @wheel.prevent="onWheel"
      @touchstart="onTouchStart"
      @touchend="onTouchEnd"
    >
      <!-- Close -->
      <button
        @click="emit('close')"
        class="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border border-brand-border"
      >
        <BIcon name="X" class="w-5 h-5" />
      </button>

      <!-- Counter -->
      <div v-if="total > 1" class="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-black/60 border border-brand-border text-white text-sm font-bold">
        {{ current + 1 }} / {{ total }}
      </div>

      <!-- Prev button -->
      <button
        v-if="total > 1"
        @click="prev"
        class="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border border-brand-border"
      >
        <BIcon name="ChevronLeft" class="w-6 h-6" />
      </button>

      <!-- Image -->
      <div class="max-w-[90vw] max-h-[90vh] flex items-center justify-center select-none">
        <img
          :src="currentUrl"
          :key="currentUrl"
          class="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl select-none"
          draggable="false"
        />
      </div>

      <!-- Next button -->
      <button
        v-if="total > 1"
        @click="next"
        class="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white border border-brand-border"
      >
        <BIcon name="ChevronRight" class="w-6 h-6" />
      </button>

      <!-- Thumbnails strip (if multiple) -->
      <div v-if="total > 1" class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        <button
          v-for="(url, idx) in images"
          :key="idx"
          @click="current = idx"
          class="w-14 h-14 rounded-lg overflow-hidden border-2 flex-shrink-0 transition-colors"
          :class="idx === current ? 'border-brand-accent' : 'border-brand-border opacity-60'"
        >
          <img :src="url" class="w-full h-full object-cover" />
        </button>
      </div>
    </div>
  </Teleport>
</template>
