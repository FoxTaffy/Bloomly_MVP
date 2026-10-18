<template>
  <section v-for="sec in sections" :key="sec.title" class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl stack-y-3">
    <h3 class="text-[10px] font-bold text-white/35 uppercase tracking-widest">{{ sec.title }}</h3>
    <div class="grid grid-cols-2 rounded-2xl border border-brand-border overflow-hidden bg-black/20">
      <div v-for="(it, i) in sec.items" :key="it.label" class="p-3.5 border-brand-border"
        :class="[i % 2 === 0 ? 'border-r' : '', i < sec.items.length - (sec.items.length % 2 === 0 ? 2 : 1) ? 'border-b' : '']">
        <p class="text-[11px] text-white/35">{{ it.label }}</p>
        <p class="text-sm font-bold text-white">{{ it.value }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DealerListing } from '@/stores/dealersDen'
const props = defineProps<{ listing: DealerListing }>()
const sections = computed(() => props.listing.commission_details?.sections ?? [])
</script>
