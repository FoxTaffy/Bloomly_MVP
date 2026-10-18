<template>
  <section class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
    <div class="p-5 stack-y-4">
      <div class="flex items-center justify-between">
        <h3 class="text-[10px] font-bold text-white/35 uppercase tracking-widest">Отзывы</h3>
        <slot name="action" />
      </div>
      <slot name="form" />

      <div v-if="reviews.length" class="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-5 items-center">
        <div>
          <p class="text-5xl font-black text-white leading-none">{{ avg.toFixed(1) }}<span class="text-sm font-semibold text-white/35 ml-1.5">/ 5</span></p>
          <p class="text-brand-yellow text-sm tracking-wider mt-2">
            <span v-for="i in 5" :key="i" :class="i <= Math.round(avg) ? '' : 'text-white/15'">★</span>
          </p>
          <p class="text-xs text-white/35 mt-1">{{ reviews.length }} {{ plural(reviews.length) }}</p>
        </div>
        <div class="stack-y-1.5">
          <div v-for="s in [5, 4, 3, 2, 1]" :key="s" class="flex items-center gap-2.5 text-xs">
            <span class="w-2 text-white/50 tabular-nums">{{ s }}</span>
            <div class="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
              <div class="h-full rounded-full bg-brand-yellow" :style="`width: ${(dist[s] / reviews.length) * 100}%`" />
            </div>
            <span class="w-5 text-right text-white/50 tabular-nums">{{ dist[s] }}</span>
          </div>
        </div>
      </div>

      <div v-if="topTags.length" class="flex flex-wrap gap-2">
        <span v-for="t in topTags" :key="t.tag" class="text-[11px] font-bold px-3 py-1 rounded-full bg-white/6 border border-brand-border text-white/70">
          {{ t.tag }} <span class="text-white/35 ml-0.5">{{ t.count }}</span>
        </span>
      </div>
    </div>

    <div class="divide-y divide-brand-border border-t border-brand-border">
      <div v-if="!reviews.length" class="py-10 text-center text-white/25 text-sm">Отзывов пока нет</div>
      <div v-for="r in shown" :key="r.id" class="px-5 py-4">
        <DenReviewCard :review="r" />
      </div>
    </div>

    <button v-if="reviews.length > LIMIT" type="button" @click="expanded = !expanded"
      class="w-full py-3.5 text-xs font-bold text-brand-accent hover:bg-white/3 transition-colors border-t border-brand-border">
      {{ expanded ? 'Свернуть' : `Показать все ${reviews.length} ${plural(reviews.length)}` }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import DenReviewCard from '@/components/DenReviewCard.vue'
import type { DenReview } from '@/stores/dealersDen'

const props = defineProps<{ reviews: DenReview[] }>()
const LIMIT = 3
const expanded = ref(false)

const avg   = computed(() => props.reviews.length ? props.reviews.reduce((s, r) => s + r.rating, 0) / props.reviews.length : 0)
const shown = computed(() => expanded.value ? props.reviews : props.reviews.slice(0, LIMIT))
const dist  = computed(() => {
  const d: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  props.reviews.forEach(r => { d[r.rating] = (d[r.rating] ?? 0) + 1 })
  return d
})
const topTags = computed(() => {
  const m = new Map<string, number>()
  props.reviews.forEach(r => r.tags.forEach(t => m.set(t, (m.get(t) ?? 0) + 1)))
  return [...m].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 6)
})

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'отзыв'
  return m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? 'отзыва' : 'отзывов'
}
</script>
