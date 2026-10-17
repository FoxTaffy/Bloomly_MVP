<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BIcon from '@/components/BIcon.vue'
import { useLangStore } from '@/stores/lang'
import { isVideoUrl } from '@/lib/mediaType'

const props = defineProps<{ src: string }>()
const lang = useLangStore()
const failed = ref(false)
const video = computed(() => isVideoUrl(props.src))
const videoSrc = computed(() => props.src.split('#')[0] + '#t=0.1')
watch(() => props.src, () => { failed.value = false })
</script>

<template>
  <div class="relative w-full h-full">
    <div v-if="failed" class="w-full h-full flex items-center justify-center bg-white/5 text-white/50">
      <BIcon :name="video ? 'Video' : 'ImageOff'" class="w-10 h-10" />
    </div>
    <video v-else-if="video" :src="videoSrc" preload="metadata" muted playsinline
      class="w-full h-full object-cover pointer-events-none" @error="failed = true" />
    <img v-else :src="src" alt="" loading="lazy" class="w-full h-full object-cover" @error="failed = true" />
    <span v-if="video" class="absolute inset-0 flex items-center justify-center pointer-events-none">
      <span class="w-12 h-12 rounded-full bg-black/50 border border-white/30 flex items-center justify-center text-white" :aria-label="lang.t.adminFolderVideo">
        <BIcon name="Play" class="w-6 h-6" />
      </span>
    </span>
  </div>
</template>
