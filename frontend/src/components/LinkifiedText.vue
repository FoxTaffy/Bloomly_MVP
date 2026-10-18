<script setup lang="ts">
import { computed } from 'vue'
import { parsePostSegments } from '@/lib/postText'

const props = defineProps<{ text: string }>()
const segs = computed(() => parsePostSegments(props.text ?? ''))
</script>

<template>
  <template v-for="seg in segs" :key="seg.key">
    <a v-if="seg.type === 'url'" :href="seg.href" target="_blank" rel="noopener noreferrer nofollow ugc"
      class="text-brand-accent hover:underline break-all" @click.stop>{{ seg.text }}</a>
    <template v-else>{{ seg.text }}</template>
  </template>
</template>
