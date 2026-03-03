<script setup lang="ts">
defineProps<{
  shortCode: string
  size?: 'sm' | 'md'
}>()
</script>

<template>
  <span
    class="soon-badge inline-flex items-center gap-1.5 font-extrabold uppercase tracking-wider rounded-xl border select-none whitespace-nowrap"
    :class="[
      size === 'sm'
        ? 'text-[10px] px-2 py-0.5'
        : 'text-xs px-2.5 py-1',
      'bg-brand-bg border-brand-accent/40 text-white'
    ]"
  >
    <!-- Arrow icon -->
    <span class="soon-arrow text-brand-success">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </span>
    <span class="text-brand-yellow text-[9px] font-bold tracking-widest">SOON</span>
    <span class="font-black">{{ shortCode }}</span>
  </span>
</template>

<style scoped>
.soon-badge {
  background: linear-gradient(135deg, rgba(22, 25, 47, 0.9), rgba(31, 34, 60, 0.95));
  backdrop-filter: blur(8px);
  box-shadow: 0 0 12px rgba(76, 103, 207, 0.15), inset 0 1px 0 rgba(255,255,255,0.05);
  animation: soon-glow 3s ease-in-out infinite;
}
.soon-arrow {
  animation: soon-slide 2s ease-in-out infinite;
}
@keyframes soon-glow {
  0%, 100% { box-shadow: 0 0 12px rgba(76, 103, 207, 0.15), inset 0 1px 0 rgba(255,255,255,0.05); }
  50% { box-shadow: 0 0 20px rgba(76, 103, 207, 0.3), inset 0 1px 0 rgba(255,255,255,0.1); }
}
@keyframes soon-slide {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(3px); }
}
</style>
