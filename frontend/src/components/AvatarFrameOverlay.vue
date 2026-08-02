<template>
  <img
    v-if="frame"
    :src="frame.image_url"
    class="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
    :style="style"
    draggable="false"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'

export interface EquippedFrame {
  image_url: string
  offset_x: number
  offset_y: number
  scale: number
  rotation: number
}

const props = defineProps<{ frame?: EquippedFrame | null }>()

const style = computed(() => props.frame ? {
  transform: `translate(${props.frame.offset_x * 100}%, ${props.frame.offset_y * 100}%) rotate(${props.frame.rotation}deg) scale(${props.frame.scale})`,
} : {})
</script>
