<template>
  <span v-if="trust" :class="['den-trust-badge', tierClass]" :title="`Den Trust: ${trust.score}/100`">
    <span class="tier-icon">{{ tierIcon }}</span>
    <span class="tier-label">{{ tierLabel }}</span>
    <span class="score">{{ trust.score }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DenTrustScore } from '../stores/dealersDen'

const props = defineProps<{ trust: DenTrustScore | null | undefined }>()

const tierClass = computed(() => {
  if (!props.trust) return ''
  return `tier-${props.trust.tier}`
})

const tierIcon = computed(() => {
  const icons: Record<string, string> = {
    new: '○', reliable: '◆', verified: '★', master: '◈', elite: '♛',
  }
  return icons[props.trust?.tier ?? 'new'] ?? '○'
})

const tierLabel = computed(() => {
  const labels: Record<string, string> = {
    new: 'Новый', reliable: 'Надёжный', verified: 'Проверен', master: 'Мастер', elite: 'Элита',
  }
  return labels[props.trust?.tier ?? 'new'] ?? ''
})
</script>

<style scoped>
.den-trust-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.tier-new      { background: #e5e7eb; color: #6b7280; }
.tier-reliable { background: #d1fae5; color: #065f46; }
.tier-verified { background: #ede9fe; color: #5b21b6; }
.tier-master   { background: #fef3c7; color: #92400e; }
.tier-elite    { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: #1c1917; }
.tier-icon     { font-size: 11px; }
.score         { opacity: 0.75; }
</style>
