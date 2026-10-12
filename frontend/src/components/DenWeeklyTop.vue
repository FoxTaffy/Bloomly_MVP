<template>
  <div class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden">
    <div class="px-4 py-3 border-b border-brand-border flex items-center justify-between">
      <h4 class="text-xs font-bold text-white/35 uppercase tracking-wider flex items-center gap-1.5">
        <BIcon name="Trophy" class="w-3.5 h-3.5 text-brand-yellow" /> {{ langStore.t.denTopTitle }}
      </h4>
      <span v-if="weekStart" class="text-[10px] text-white/25">{{ weekStart }}</span>
    </div>

    <div v-if="isLoading" class="py-6 text-center text-white/25 text-xs">{{ langStore.t.denTopLoading }}</div>

    <div v-else-if="!top.length" class="py-6 text-center text-white/20 text-xs">
      <BIcon name="TrophyOff" class="w-6 h-6 mx-auto mb-1.5 opacity-20" />
      {{ langStore.t.denTopEmpty }}
    </div>

    <div v-else class="divide-y divide-brand-border">
      <RouterLink
        v-for="entry in top"
        :key="entry.id"
        :to="`/dealers-den/seller/${entry.user.username}`"
        class="flex items-center gap-2.5 px-4 py-2.5 hover:bg-white/4 transition-colors"
        :class="entry.rank === 1 ? 'bg-brand-yellow/4' : ''"
      >
        <span class="text-base w-5 text-center flex-shrink-0">{{ rankEmoji(entry.rank) }}</span>
        <img v-if="entry.user.avatar_url" :src="entry.user.avatar_url"
          class="w-7 h-7 rounded-full object-cover border border-brand-border flex-shrink-0" />
        <div v-else
          class="w-7 h-7 rounded-full bg-brand-accent/20 flex items-center justify-center text-brand-accent text-[10px] font-extrabold border border-brand-border flex-shrink-0">
          {{ (entry.user.display_name || entry.user.username).slice(0, 2).toUpperCase() }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold text-white truncate leading-tight">
            {{ entry.user.display_name || entry.user.username }}
          </p>
          <p class="text-[10px] text-white/35 leading-tight">
            {{ entry.sales_count }} {{ langStore.t.denTopSalesSuffix }} · {{ Number(entry.avg_rating).toFixed(1) }}★
          </p>
        </div>
        <span class="text-xs font-black text-brand-accent tabular-nums flex-shrink-0">
          {{ Number(entry.score).toFixed(0) }}
        </span>
      </RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useLangStore } from '@/stores/lang'
import { useDealersDenStore, type DenWeeklyTopEntry } from '../stores/dealersDen'

const langStore = useLangStore()
const store     = useDealersDenStore()
const top       = ref<DenWeeklyTopEntry[]>([])
const weekStart = ref('')
const isLoading = ref(false)

function rankEmoji(rank: number) {
  return ['🥇', '🥈', '🥉'][rank - 1] ?? `#${rank}`
}

onMounted(async () => {
  isLoading.value = true
  try {
    const result = await store.loadWeeklyTop()
    top.value = result.top
    weekStart.value = result.weekStart
  } finally {
    isLoading.value = false
  }
})
</script>
