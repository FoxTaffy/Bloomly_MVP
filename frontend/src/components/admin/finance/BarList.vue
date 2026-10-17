<script setup lang="ts">
import { computed } from 'vue'

export interface BarItem { key: string; label: string; value: number; display: string; sub?: string; color?: string }
const props = defineProps<{ items: BarItem[]; color?: string; empty?: string }>()
const max = computed(() => Math.max(...props.items.map((i) => i.value), 1))
</script>

<template>
  <p v-if="!items.length" class="text-xs text-white/25 text-center py-6">{{ empty }}</p>
  <ul v-else class="space-y-3">
    <li v-for="it in items" :key="it.key">
      <div class="flex items-baseline justify-between gap-3 mb-1">
        <span class="text-xs font-semibold text-white/80 truncate">{{ it.label }}</span>
        <span class="text-xs font-bold text-white tabular-nums flex-shrink-0">{{ it.display }}<span v-if="it.sub" class="font-semibold text-white/40"> · {{ it.sub }}</span></span>
      </div>
      <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
        <div class="h-full rounded-full" :style="`width:${Math.max(it.value > 0 ? 2 : 0, (it.value / max) * 100)}%;background:${it.color || color || '#3987e5'}`" />
      </div>
    </li>
  </ul>
</template>
