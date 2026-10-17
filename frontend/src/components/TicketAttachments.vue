<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import SafeMedia from './SafeMedia.vue'
import BIcon from './BIcon.vue'

const props = defineProps<{ urls: string[] }>()

const isVideo = (url: string) => /\.(mp4|webm|mov|m4v)$/i.test(url.split('?')[0])

// Only images open full-screen — videos already have their own controls (incl. fullscreen).
const images = computed(() => (props.urls ?? []).filter((u) => !isVideo(u)))
const openIndex = ref<number | null>(null)

function open(url: string) { openIndex.value = images.value.indexOf(url) }
function close() { openIndex.value = null }
function step(delta: number) {
  if (openIndex.value === null || images.value.length < 2) return
  openIndex.value = (openIndex.value + delta + images.value.length) % images.value.length
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
  else if (e.key === 'ArrowLeft') step(-1)
  else if (e.key === 'ArrowRight') step(1)
}
watch(openIndex, (i) => {
  if (i === null) document.removeEventListener('keydown', onKey)
  else document.addEventListener('keydown', onKey)
})
onUnmounted(() => document.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="urls?.length" class="flex gap-2 mt-2 flex-wrap">
    <template v-for="(url, i) in urls" :key="i">
      <SafeMedia
        v-if="isVideo(url)"
        :src="url" source="support-attachment" kind="video"
        class="w-full max-w-sm max-h-64 rounded-lg border border-white/10"
      />
      <button v-else type="button" class="flex-shrink-0 cursor-zoom-in" @click="open(url)">
        <SafeMedia
          :src="url" source="support-attachment" kind="image"
          class="w-24 h-24 rounded-lg overflow-hidden border border-white/10 object-cover hover:border-white/30 transition-colors"
        />
      </button>
    </template>
  </div>

  <Teleport to="body">
    <div v-if="openIndex !== null" class="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center" @click.self="close">
      <SafeMedia
        :src="images[openIndex]" source="support-attachment" kind="image"
        class="max-w-[92vw] max-h-[88vh] object-contain rounded-lg"
      />
      <button type="button" class="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white" @click="close">
        <BIcon name="X" class="w-5 h-5" />
      </button>
      <template v-if="images.length > 1">
        <button type="button" class="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white" @click="step(-1)">
          <BIcon name="ChevronLeft" class="w-5 h-5" />
        </button>
        <button type="button" class="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white" @click="step(1)">
          <BIcon name="ChevronRight" class="w-5 h-5" />
        </button>
        <span class="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60">{{ openIndex + 1 }} / {{ images.length }}</span>
      </template>
    </div>
  </Teleport>
</template>
