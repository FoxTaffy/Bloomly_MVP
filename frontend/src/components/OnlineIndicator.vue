<script setup lang="ts">
import { computed } from 'vue'
import { Smartphone, Tablet } from 'lucide-vue-next'
import { deviceKind } from '@/lib/deviceIcon'

// Online badge in the corner of an avatar. Phone/tablet — a filled green device icon,
// desktop or unknown device — the usual green dot. Same look everywhere (friends, chats).
const props = withDefaults(defineProps<{
  device?: string | null
  size?: 'sm' | 'md' | 'lg'
}>(), { size: 'md' })

const kind = computed(() => deviceKind(props.device))
const icon = computed(() => (kind.value === 'mobile' ? Smartphone : kind.value === 'tablet' ? Tablet : null))

const SIZES = {
  sm: { wrap: 'w-4 h-4 -bottom-1 -right-1', icon: 'w-3.5 h-3.5', dot: 'w-3 h-3 -bottom-0.5 -right-0.5' },
  md: { wrap: 'w-5 h-5 -bottom-1 -right-1', icon: 'w-4 h-4', dot: 'w-3 h-3 bottom-0 right-0' },
  lg: { wrap: 'w-7 h-7 bottom-0 right-0', icon: 'w-5 h-5', dot: 'w-4 h-4 bottom-1 right-1' },
} as const
</script>

<template>
  <span
    v-if="icon"
    :title="device ?? undefined"
    :class="['absolute rounded-full bg-brand-card flex items-center justify-center', SIZES[size].wrap]"
  >
    <component :is="icon" :class="['text-brand-success fill-brand-success', SIZES[size].icon]" />
  </span>
  <span
    v-else
    :title="device ?? undefined"
    :class="['absolute bg-brand-success rounded-full border-2 border-brand-card', SIZES[size].dot]"
  />
</template>
