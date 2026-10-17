<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import type { CommissionInfo } from '@/stores/groups'

const props = defineProps<{ info: CommissionInfo }>()

const statusLabel = computed(() => {
  const map: Record<string, string> = { open: 'Открыт', closed: 'Закрыт', waitlist: 'Лист ожидания' }
  return map[props.info.status] ?? props.info.status
})

const statusColor = computed(() => {
  const map: Record<string, string> = {
    open: 'bg-brand-success/15 text-brand-success',
    closed: 'bg-brand-error/15 text-brand-error',
    waitlist: 'bg-brand-yellow/15 text-brand-yellow',
  }
  return map[props.info.status] ?? 'bg-brand-muted/15 text-white/50'
})

const queuePercent = computed(() =>
  props.info.max_queue > 0 ? Math.min(100, Math.round((props.info.queue_count / props.info.max_queue) * 100)) : 0
)

const priceEntries = computed(() =>
  Object.entries(props.info.base_prices ?? {}).map(([k, v]) => ({ key: k, price: v }))
)

const priceLabels: Record<string, string> = {
  headshot: 'Хэдшот',
  halfbody: 'Полтела',
  fullbody: 'В полный рост',
  ref_sheet: 'Рефшит',
}
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl p-5 stack-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <h3 class="text-white font-extrabold text-base">Заказы</h3>
      <span class="text-xs font-bold px-2.5 py-1 rounded-xl" :class="statusColor">
        {{ statusLabel }}
      </span>
    </div>

    <!-- Queue -->
    <div>
      <div class="flex items-center justify-between text-xs text-white/50 mb-1">
        <span>Очередь</span>
        <span>{{ info.queue_count }} / {{ info.max_queue }}</span>
      </div>
      <div class="h-1.5 bg-brand-border rounded-full overflow-hidden">
        <div
          class="h-full bg-brand-accent rounded-full transition-all duration-500"
          :style="{ width: `${queuePercent}%` }"
        />
      </div>
    </div>

    <!-- Price Calculator -->
    <div v-if="priceEntries.length">
      <p class="text-white/40 text-xs font-semibold uppercase tracking-wide mb-2">Калькулятор</p>
      <div class="grid grid-cols-2 gap-2">
        <div
          v-for="entry in priceEntries"
          :key="entry.key"
          class="bg-brand-bg/60 border border-brand-border rounded-xl p-3 hover:border-brand-accent/30 transition-colors cursor-pointer"
        >
          <p class="text-white text-xs font-bold mb-0.5">{{ priceLabels[entry.key] ?? entry.key }}</p>
          <p class="text-brand-accent-minus font-extrabold text-sm">
            от {{ entry.price }} {{ info.currency }}
          </p>
        </div>
      </div>
    </div>

    <!-- TOS -->
    <div v-if="info.tos_text" class="text-white/30 text-[11px] leading-relaxed">
      <BIcon name="FileText" class="w-3 h-3 inline mr-1" />
      {{ info.tos_text }}
    </div>
  </div>
</template>
