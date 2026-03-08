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
const isAlmostOut = computed(() => !isSoldOut.value && soldPercent.value >= 70)

const priceFormatted = computed(() => {
  const n = parseFloat(props.tier.price)
  const curr = props.tier.currency || 'RUB'
  if (curr === 'RUB') {
    return new Intl.NumberFormat('ru-RU').format(n) + ' ₽'
  }
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: curr }).format(n)
})
</script>

<template>
  <div class="ticket-card border rounded-2xl overflow-hidden transition-all duration-200"
    :class="isSoldOut ? 'border-brand-border/40 opacity-75' : 'border-brand-border hover:border-brand-accent/40'">

    <!-- Header: name + price row -->
    <div class="p-4 pb-3">
      <div class="flex items-start justify-between gap-2 mb-0.5">
        <h4 class="text-white font-bold text-sm leading-tight flex-1">{{ tier.name }}</h4>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded-lg flex-shrink-0 mt-0.5"
          :class="isSoldOut
            ? 'bg-brand-error/15 text-brand-error border border-brand-error/20'
            : 'bg-brand-border/60 text-white/55 border border-brand-border'">
          1 билет
        </span>
      </div>
      <p class="text-[22px] font-extrabold leading-none mt-1"
        :class="isSoldOut ? 'text-white/30' : 'text-white'">{{ priceFormatted }}</p>
    </div>

    <!-- Progress: remaining tickets -->
    <div class="px-4 pb-3">
      <div class="flex items-center justify-between text-[10px] text-white/40 mb-1.5">
        <span>Осталось билетов</span>
        <span class="font-bold"
          :class="isSoldOut ? 'text-brand-error' : isAlmostOut ? 'text-brand-yellow' : 'text-white/55'">
          {{ remaining }}/{{ tier.total_count }}
        </span>
      </div>
      <div class="h-1.5 rounded-full overflow-hidden" style="background: rgba(255,255,255,0.08)">
        <div class="h-full rounded-full transition-all duration-500"
          :class="isSoldOut ? 'bg-brand-error' : isAlmostOut ? 'bg-brand-yellow' : 'bg-brand-success'"
          :style="{ width: `${soldPercent}%` }" />
      </div>
    </div>

    <!-- Perks list -->
    <div v-if="tier.perks?.length" class="px-4 pb-3 space-y-1">
      <div v-for="(perk, i) in tier.perks" :key="i"
        class="flex items-center gap-2 text-[11px] text-white/50">
        <span class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          :class="isSoldOut ? 'bg-white/20' : 'bg-brand-accent/60'" />
        {{ perk }}
      </div>
    </div>

    <!-- Description -->
    <div v-if="tier.description && !tier.perks?.length" class="px-4 pb-3">
      <p class="text-[11px] text-white/40 leading-relaxed">{{ tier.description }}</p>
    </div>

    <!-- Divider -->
    <div class="mx-4 h-px" style="background: rgba(255,255,255,0.06)"></div>

    <!-- Action button -->
    <div class="p-3">
      <button
        class="w-full py-2.5 rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2"
        :class="isSoldOut
          ? 'bg-brand-error/10 text-brand-error/60 cursor-not-allowed border border-brand-error/20'
          : 'bg-brand-accent text-white hover:bg-brand-accent-plus shadow-md shadow-brand-accent/20'"
        :disabled="isSoldOut"
      >
        <BIcon v-if="!isSoldOut" name="Ticket" class="w-4 h-4" />
        <BIcon v-else name="X" class="w-4 h-4" />
        {{ isSoldOut ? 'Недоступно' : 'Купить билет' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ticket-card {
  background: rgba(255, 255, 255, 0.02);
}
</style>
