<script setup lang="ts">
import { computed } from 'vue'
import { useLangStore } from '@/stores/lang'

// Структурированные поля баг-репорта из обращения: шаги, ожидаемый результат, устройство и браузер
const props = defineProps<{
  ticket: { steps_to_reproduce?: string | null; expected_result?: string | null; device?: string | null; browser?: string | null }
}>()

const langStore = useLangStore()

const deviceLabel = computed(() => {
  const t = langStore.t
  return ({ desktop: t.bugDeviceDesktop, mobile: t.bugDeviceMobile, tablet: t.bugDeviceTablet } as Record<string, string>)[props.ticket.device ?? ''] ?? props.ticket.device
})
const hasAny = computed(() => !!(props.ticket.steps_to_reproduce || props.ticket.expected_result || props.ticket.device || props.ticket.browser))
</script>

<template>
  <div v-if="hasAny" class="mt-3 stack-y-2">
    <div v-if="ticket.steps_to_reproduce" class="px-3 py-2 rounded-xl bg-white/5 border border-white/6">
      <p class="text-[10px] font-bold mb-0.5 text-white/30">{{ langStore.t.bugStepsLabel }}</p>
      <p class="text-xs text-white/70 whitespace-pre-wrap font-mono">{{ ticket.steps_to_reproduce }}</p>
    </div>
    <div v-if="ticket.expected_result" class="px-3 py-2 rounded-xl bg-white/5 border border-white/6">
      <p class="text-[10px] font-bold mb-0.5 text-white/30">{{ langStore.t.bugExpectedLabel }}</p>
      <p class="text-xs text-white/70 whitespace-pre-wrap">{{ ticket.expected_result }}</p>
    </div>
    <p v-if="ticket.device || ticket.browser" class="text-[10px] text-white/35">
      <template v-if="ticket.device">{{ langStore.t.bugDeviceLabel }}: {{ deviceLabel }}</template>
      <template v-if="ticket.device && ticket.browser"> · </template>
      <template v-if="ticket.browser">{{ langStore.t.bugBrowserLabel }}: {{ ticket.browser }}</template>
    </p>
  </div>
</template>
