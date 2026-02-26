<script setup lang="ts">
import { computed } from 'vue'
import * as icons from 'lucide-vue-next'

const props = defineProps<{
  name: string
  class?: string
}>()

const iconComponent = computed(() => {
  return (icons as any)[props.name]
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
