<script setup lang="ts">
import BIcon from '@/components/BIcon.vue'

defineProps<{ icon?: string; title: string; hint?: string }>()
</script>

<template>
  <div class="card-surface text-center py-16 px-4 rounded-3xl">
    <div class="w-20 h-20 bg-brand-bg rounded-full flex items-center justify-center mx-auto mb-5">
      <BIcon :name="icon ?? 'ShoppingBag'" class="w-10 h-10 text-white/20" />
    </div>
    <h3 class="text-lg font-bold text-white" :class="hint ? 'mb-2' : ''">{{ title }}</h3>
    <p v-if="hint" class="text-white/35 text-sm">{{ hint }}</p>
    <div v-if="$slots.default" class="mt-6"><slot /></div>
  </div>
</template>
