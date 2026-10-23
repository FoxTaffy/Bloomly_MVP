<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { formatNum } from './adminHelpers'

// Линейный график нарастающего итога по месяцам: линия на SVG, подсказка — обычной разметкой,
// чтобы точки и текст не искажались при растяжении под ширину карточки.
const props = defineProps<{
  title: string
  subtitle: string
  color: string
  series: { label: string; total: number }[]
  state: 'loading' | 'error' | 'empty' | 'ok'
}>()
const emit = defineEmits<{ retry: [] }>()

const gid = `gc-${useId()}`
const hovered = ref<number | null>(null)

const bounds = computed(() => {
  const totals = props.series.map(p => p.total)
  const max = Math.max(...totals, 1)
  const min = Math.min(...totals, max)
  return { min, max, range: Math.max(max - min, 1) }
})
const coords = computed(() => {
  const n = props.series.length
  if (n < 2) return []
  return props.series.map((p, i) => ({
    x: (i / (n - 1)) * 100,
    y: 92 - ((p.total - bounds.value.min) / bounds.value.range) * 80,
    ...p,
  }))
})
const line = computed(() => coords.value.map(c => `${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' '))
const delta = computed(() => {
  const s = props.series
  return s.length > 1 ? s[s.length - 1].total - s[s.length - 2].total : 0
})
const active = computed(() => hovered.value == null ? null : coords.value[hovered.value] ?? null)
</script>

<template>
  <div class="rounded-2xl border border-brand-border bg-brand-card p-4 sm:p-5 min-w-0">
    <div class="flex items-start justify-between gap-3 mb-4">
      <div class="min-w-0">
        <h3 class="font-extrabold text-white text-sm">{{ title }}</h3>
        <p class="text-xs text-white/40 mt-0.5">{{ subtitle }}</p>
      </div>
      <div v-if="state === 'ok'" class="text-right shrink-0">
        <p class="text-xl font-black text-white leading-none">{{ formatNum(series[series.length - 1]?.total ?? 0) }}</p>
        <p class="text-[11px] font-bold mt-1" :style="`color:${color}`">{{ delta >= 0 ? '+' : '' }}{{ formatNum(delta) }} за месяц</p>
      </div>
    </div>

    <div v-if="state === 'ok'" class="relative h-36 sm:h-40" @mouseleave="hovered = null">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="absolute inset-0 w-full h-full overflow-visible">
        <defs>
          <linearGradient :id="gid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" :stop-color="color" stop-opacity="0.35" />
            <stop offset="100%" :stop-color="color" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line v-for="gy in [25, 50, 75]" :key="gy" x1="0" x2="100" :y1="gy" :y2="gy" stroke="white" stroke-opacity="0.06" vector-effect="non-scaling-stroke" />
        <polygon :points="`0,100 ${line} 100,100`" :fill="`url(#${gid})`" />
        <polyline :points="line" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      </svg>
      <!-- Колонки наведения: ловят и мышь, и касание -->
      <div class="absolute inset-0 flex">
        <div v-for="(c, i) in coords" :key="i" class="flex-1 h-full cursor-pointer"
          @mouseenter="hovered = i" @touchstart.passive="hovered = i" />
      </div>
      <template v-if="active">
        <span class="absolute w-2.5 h-2.5 rounded-full border-2 border-brand-card -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          :style="`left:${active.x}%;top:${active.y}%;background:${color}`" />
        <div class="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none px-2.5 py-1.5 rounded-xl bg-[#0B1030]/95 border border-white/10 shadow-lg shadow-black/40 whitespace-nowrap"
          :style="`left:${Math.min(88, Math.max(12, active.x))}%;top:${active.y}%;margin-top:-10px`">
          <p class="text-[9px] text-white/45 font-semibold capitalize">{{ active.label }}</p>
          <p class="text-xs font-black text-white">{{ formatNum(active.total) }}</p>
        </div>
      </template>
    </div>
    <div v-if="state === 'ok'" class="flex justify-between mt-2">
      <span v-for="(p, i) in series" :key="i" class="text-[9px] text-white/30 capitalize" :class="i % 2 === 1 ? 'hidden sm:inline' : ''">{{ p.label }}</span>
    </div>

    <div v-else class="h-40 flex flex-col items-center justify-center gap-2 text-white/30">
      <div v-if="state === 'loading'" class="w-full h-full rounded-xl bg-white/5 animate-pulse" />
      <template v-else-if="state === 'error'">
        <p class="text-xs font-semibold">Не удалось загрузить</p>
        <button @click="emit('retry')" class="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/8 text-white/60 hover:text-white transition-all">Повторить</button>
      </template>
      <p v-else class="text-xs font-semibold">Пока нет данных</p>
    </div>
  </div>
</template>
