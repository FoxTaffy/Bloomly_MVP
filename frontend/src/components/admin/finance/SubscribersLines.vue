<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFinanceT } from './strings'
import { TIER_COLOR, dayLabel, num } from './financeFormat'

interface Day { day: string; lite: number; pro: number; business: number }
const props = defineProps<{ days: Day[]; loading?: boolean }>()
const t = useFinanceT()

const W = 600, H = 200, PAD_T = 8, PAD_B = 4
const tiers = computed(() => (['lite', 'pro', 'business'] as const).filter((k) => props.days.some((d) => d[k] > 0)))
const top = computed(() => {
  const max = Math.max(...props.days.flatMap((d) => tiers.value.map((k) => d[k])), 0)
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  return Math.max(1, Math.ceil(max / pow) * pow)
})
const x = (i: number) => (props.days.length > 1 ? (i / (props.days.length - 1)) * W : W / 2)
const y = (v: number) => PAD_T + (1 - v / top.value) * (H - PAD_T - PAD_B)
const path = (k: 'lite' | 'pro' | 'business') => props.days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(' ')

const hover = ref<number | null>(null)
const onMove = (e: PointerEvent) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
  hover.value = Math.round(f * (props.days.length - 1))
}
const labelEvery = computed(() => Math.max(1, Math.ceil(props.days.length / 6)))
const last = computed(() => props.days[props.days.length - 1])
const TIER_LABEL: Record<string, string> = { lite: 'Lite', pro: 'Pro', business: 'Business' }
</script>

<template>
  <div :class="loading ? 'opacity-60 transition-opacity' : 'transition-opacity'">
    <p v-if="!tiers.length" class="text-xs text-white/25 text-center py-14">{{ t('noData') }}</p>
    <template v-else>
      <ul class="flex items-center gap-4 flex-wrap mb-4">
        <li v-for="k in tiers" :key="k" class="flex items-center gap-1.5 text-xs text-white/70">
          <span class="w-4 h-0.5 rounded-sm" :style="`background:${TIER_COLOR[k]}`" />
          {{ TIER_LABEL[k] }} <span class="font-bold text-white">{{ last[k] }}</span>
        </li>
      </ul>
      <div class="flex gap-2">
        <div class="relative h-48 w-9 shrink-0 text-[10px] text-white/35 tabular-nums" aria-hidden="true">
          <span class="absolute right-0 top-0">{{ num(top) }}</span>
          <span class="absolute right-0 bottom-0">0</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="relative h-48 touch-none" @pointermove="onMove" @pointerleave="hover = null">
            <div v-for="i in 3" :key="i" class="absolute inset-x-0 border-t border-white/[0.06]" :style="`top:${((i - 1) / 2) * 100}%`" />
            <svg :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" class="absolute inset-0 w-full h-full overflow-visible" role="img" :aria-label="t('subsTitle')">
              <path v-for="k in tiers" :key="k" :d="path(k)" fill="none" :stroke="TIER_COLOR[k]" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
            </svg>
            <template v-if="hover !== null">
              <div class="absolute inset-y-0 w-px bg-white/25 pointer-events-none" :style="`left:${(x(hover) / W) * 100}%`" />
              <span v-for="k in tiers" :key="k" class="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none ring-2 ring-brand-card"
                :style="`left:${(x(hover) / W) * 100}%;top:${(y(days[hover][k]) / H) * 100}%;background:${TIER_COLOR[k]}`" />
              <div class="absolute top-1 z-20 pointer-events-none rounded-xl bg-[#11132a] border border-white/10 px-3 py-2 shadow-xl whitespace-nowrap"
                :style="hover > days.length / 2 ? `right:${100 - (x(hover) / W) * 100}%;margin-right:10px` : `left:${(x(hover) / W) * 100}%;margin-left:10px`">
                <p class="text-[10px] font-bold text-white/50 mb-1">{{ dayLabel(days[hover].day) }}</p>
                <p v-for="k in tiers" :key="k" class="flex items-center gap-1.5 text-[11px] text-white/60">
                  <span class="w-3 h-0.5 rounded-sm" :style="`background:${TIER_COLOR[k]}`" />{{ TIER_LABEL[k] }}
                  <span class="ml-auto pl-3 font-bold text-white tabular-nums">{{ days[hover][k] }}</span>
                </p>
              </div>
            </template>
          </div>
          <div class="relative h-4 mt-1.5 text-[10px] text-white/35" aria-hidden="true">
            <span v-for="(d, i) in days" :key="d.day" v-show="i % labelEvery === 0" class="absolute -translate-x-1/2 whitespace-nowrap" :style="`left:${(x(i) / W) * 100}%`">{{ dayLabel(d.day) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
