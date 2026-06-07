<template>
  <div class="relative w-full h-full overflow-hidden">
    <!-- Shimmer placeholder — shown while image is loading -->
    <div v-if="!loaded" class="absolute inset-0 sticker-shimmer" />
    <!-- Image hidden until fully loaded, then fades in smoothly -->
    <img
      :src="src"
      :alt="alt"
      :class="['w-full h-full object-contain select-none', imgClass]"
      :style="{ opacity: loaded ? 1 : 0, transition: 'opacity 0.25s ease' }"
      loading="lazy"
      draggable="false"
      @load="loaded = true"
      @error="loaded = true"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  src: string
  alt?: string
  imgClass?: string
}>(), { alt: 'sticker', imgClass: '' })

const loaded = ref(false)
</script>

<style scoped>
.sticker-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.10) 50%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 200% 100%;
  animation: sticker-shimmer-anim 1.4s ease infinite;
}

@keyframes sticker-shimmer-anim {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
