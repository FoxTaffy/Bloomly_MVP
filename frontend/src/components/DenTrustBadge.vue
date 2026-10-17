<template>
  <span v-if="trust" class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border"
    :class="tierClass" :title="`Den Trust: ${trust.score}/100`">
    <span>{{ tierIcon }}</span>
    <span>{{ tierLabel }}</span>
    <span class="opacity-60">{{ trust.score }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DenTrustScore } from '../stores/dealersDen'

const props = defineProps<{ trust: DenTrustScore | null | undefined }>()

const tierClass = computed(() => ({
  new:      'bg-white/5 border-white/10 text-white/40',
  reliable: 'bg-brand-success/10 border-brand-success/30 text-brand-success',
  verified: 'bg-brand-purple/10 border-brand-purple/30 text-brand-purple',
  master:   'bg-brand-yellow/10 border-brand-yellow/30 text-brand-yellow',
  elite:    'bg-linear-to-r/srgb from-brand-yellow/20 to-brand-accent/20 border-brand-yellow/40 text-brand-yellow',
}[props.trust?.tier ?? 'new'] ?? 'bg-white/5 border-white/10 text-white/40'))

const tierIcon = computed(() => ({
  new: '○', reliable: '◆', verified: '★', master: '◈', elite: '♛',
}[props.trust?.tier ?? 'new'] ?? '○'))

const tierLabel = computed(() => ({
  new: 'Новый', reliable: 'Надёжный', verified: 'Проверен', master: 'Мастер', elite: 'Элита',
}[props.trust?.tier ?? 'new'] ?? ''))
</script>
