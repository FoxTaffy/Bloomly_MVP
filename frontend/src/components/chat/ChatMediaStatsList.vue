<template>
  <div v-if="loading" class="flex items-center justify-center py-6 text-white/55 text-sm gap-2">
    <BIcon name="Loader2" class="w-4 h-4 animate-spin" /> {{ langStore.t.loadingBtn }}
  </div>
  <p v-else-if="emptyLabel && !nonEmpty.length" class="text-center text-xs text-white/30 py-6">{{ emptyLabel }}</p>
  <button v-for="stat in nonEmpty" :key="stat.key"
    @click="emit('open', stat.key)"
    :class="['w-full flex items-center gap-3 py-2.5 hover:bg-brand-bg/40 transition-colors text-left', rowClass]">
    <BIcon :name="stat.icon" class="w-4 h-4 text-brand-accent shrink-0" />
    <span class="text-sm text-white/85">{{ stat.count }} {{ stat.label.toLowerCase() }}</span>
    <BIcon name="ChevronRight" class="w-3.5 h-3.5 text-white/25 ml-auto shrink-0" />
  </button>
</template>

<script lang="ts">
export interface MediaStat { key: string; label: string; icon: string; count: number }
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { useLangStore } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'

/** Per-type media counters in the chat info modals; rows with zero items are hidden. */
const props = defineProps<{ stats: MediaStat[]; loading: boolean; emptyLabel?: string; rowClass?: string }>()
const emit = defineEmits<{ (e: 'open', type: string): void }>()
const langStore = useLangStore()
const nonEmpty = computed(() => props.stats.filter((s) => s.count > 0))
</script>
