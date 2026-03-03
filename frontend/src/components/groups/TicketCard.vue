<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import type { TicketTier } from '@/stores/groups'

const props = defineProps<{ tier: TicketTier }>()

const soldPercent = computed(() => {
  if (!props.tier.total_count) return 0
  return Math.min(100, Math.round((props.tier.sold_count / props.tier.total_count) * 100))
})

const remaining = computed(() => props.tier.total_count - props.tier.sold_count)
const isSoldOut = computed(() => remaining.value <= 0)

const priceFormatted = computed(() => {
  const n = parseFloat(props.tier.price)
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: props.tier.currency || 'USD' }).format(n)
})
</script>

<template>
  <div class="bg-brand-bg/60 border border-brand-border rounded-2xl p-4 hover:border-brand-accent/30 transition-colors">
    <div class="flex items-start justify-between mb-3">
      <div>
        <h4 class="text-white font-bold text-sm">{{ tier.name }}</h4>
        <p class="text-brand-accent-minus font-extrabold text-lg">{{ priceFormatted }}</p>
      </div>
      <span
        class="text-xs font-bold px-2 py-0.5 rounded-lg"
        :class="isSoldOut ? 'bg-brand-error/15 text-brand-error' : 'bg-brand-success/15 text-brand-success'"
      >
        {{ isSoldOut ? 'Sold Out' : `${remaining} шт.` }}
      </span>
    </div>

    <!-- Progress bar -->
    <div class="h-1.5 bg-brand-border rounded-full overflow-hidden mb-3">
      <div
        class="h-full rounded-full transition-all duration-500"
        :class="isSoldOut ? 'bg-brand-error' : 'bg-brand-success'"
        :style="{ width: `${soldPercent}%` }"
      />
    </div>

    <button
      class="w-full py-2.5 rounded-xl font-bold text-sm transition-all duration-200"
      :class="isSoldOut
        ? 'bg-brand-muted/30 text-white/30 cursor-not-allowed'
        : 'bg-brand-accent text-white hover:bg-brand-accent-plus shadow-accent'"
      :disabled="isSoldOut"
    >
      <BIcon v-if="!isSoldOut" name="Ticket" class="w-4 h-4 inline mr-1.5 -mt-0.5" />
      {{ isSoldOut ? 'Нет в наличии' : 'Купить' }}
    </button>
  </div>
</template>
