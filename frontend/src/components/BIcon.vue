<script setup lang="ts">
import { computed } from 'vue'
import { iconMap } from '@/lib/icons'

const props = defineProps<{
  name: string
  class?: string
}>()

const iconComponent = computed(() => {
  return iconMap[props.name]
})
</script>

<template>
  <component 
    :is="iconComponent" 
    v-if="iconComponent"
    class="stroke-[1.5px]"
    :class="props.class"
  />
</template>
