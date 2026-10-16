<script setup lang="ts">
import SafeMedia from './SafeMedia.vue'

defineProps<{ urls: string[] }>()

const isVideo = (url: string) => /\.(mp4|webm|mov|m4v)$/i.test(url.split('?')[0])
</script>

<template>
  <div v-if="urls?.length" class="flex gap-2 mt-2 flex-wrap">
    <SafeMedia
      v-for="(url, i) in urls" :key="i"
      :src="url" source="support-attachment" :kind="isVideo(url) ? 'video' : 'image'"
      :class="isVideo(url)
        ? 'w-full max-w-sm max-h-64 rounded-lg border border-white/10'
        : 'w-24 h-24 rounded-lg overflow-hidden border border-white/10 flex-shrink-0 object-cover'"
    />
  </div>
</template>
