<script setup lang="ts">
import { computed, ref } from 'vue'
import { useFinanceT } from './strings'
import { PURPOSE_COLOR, rub, dayLabel, num } from './financeFormat'

interface Day { day: string; subscription: number; topup: number; donation: number; total: number; count: number }
const props = defineProps<{ days: Day[]; loading?: boolean }>()
const t = useFinanceT()

const SERIES = [
  { key: 'subscription', label: 'purSubscription' },
  { key: 'topup', label: 'purTopup' },
  { key: 'donation', label: 'purDonation' },
] as const

const asTable = ref(false)
const hover = ref<number | null>(null)

// Верх шкалы — «красивое» число над максимумом, чтобы столбцы не упирались в потолок
const top = computed(() => {
  const max = Math.max(...props.days.map((d) => d.total), 0)
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  return Math.ceil(max / pow) * pow
})
const ticks = computed(() => [top.value, top.value / 2, 0])
const labelEvery = computed(() => Math.max(1, Math.ceil(props.days.length / 7)))
const hasData = computed(() => props.days.some((d) => d.total > 0))
// Скруглён верх только у самого верхнего непустого сегмента стопки
const topKey = (d: Day) => ([...SERIES].reverse().find((s) => d[s.key] > 0)?.key ?? null)
const sum = (k: 'subscription' | 'topup' | 'donation') => props.days.reduce((s, d) => s + d[k], 0)

// Тултип не должен вылезать за края: у крайних столбцов прижимаем его к краю
const tipSide = (i: number) => (i < props.days.length * 0.2 ? 'left-0' : i > props.days.length * 0.8 ? 'right-0' : 'left-1/2 -translate-x-1/2')
</script>

<template>
  <div :class="loading ? 'opacity-60 transition-opacity' : 'transition-opacity'">
    <div class="flex items-center justify-between gap-3 flex-wrap mb-4">
      <ul class="flex items-center gap-4 flex-wrap">
        <li v-for="s in SERIES" :key="s.key" class="flex items-center gap-1.5 text-xs text-white/70">
          <span class="w-2.5 h-2.5 rounded-[3px]" :style="`background:${PURPOSE_COLOR[s.key]}`" />
          {{ t(s.label) }} <span class="font-bold text-white">{{ rub(sum(s.key)) }}</span>
        </li>
      </ul>
      <button type="button" class="text-[11px] font-bold text-white/50 hover:text-white px-2.5 py-1 rounded-lg bg-white/5" @click="asTable = !asTable">
        {{ asTable ? t('asChart') : t('asTable') }}
      </button>
    </div>

    <p v-if="!hasData" class="text-xs text-white/25 text-center py-14">{{ t('noData') }}</p>

    <div v-else-if="!asTable" class="flex gap-2">
      <div class="relative h-52 w-12 flex-shrink-0 text-[10px] text-white/35 tabular-nums" aria-hidden="true">
        <span v-for="(v, i) in ticks" :key="i" class="absolute right-0 -translate-y-1/2" :style="`top:${(i / 2) * 100}%`">{{ num(Math.round(v)) }}</span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="relative h-52" @pointerleave="hover = null">
          <div v-for="i in 3" :key="i" class="absolute inset-x-0 border-t border-white/[0.06]" :style="`top:${((i - 1) / 2) * 100}%`" />
          <div class="absolute inset-0 flex items-end gap-[2px]">
            <div v-for="(d, i) in days" :key="d.day" class="relative flex-1 h-full flex flex-col justify-end outline-none cursor-default"
              tabindex="0" :aria-label="`${dayLabel(d.day)}: ${rub(d.total)}`"
              @pointerenter="hover = i" @focus="hover = i" @blur="hover = null">
              <!-- Зона наведения шире самого столбца -->
              <div class="absolute inset-0" :class="hover === i ? 'bg-white/[0.05] rounded-md' : ''" />
              <div v-for="s in [...SERIES].reverse()" :key="s.key" class="relative w-full transition-opacity"
                :class="[hover !== null && hover !== i ? 'opacity-60' : '', topKey(d) === s.key ? 'rounded-t-[4px]' : '']"
                :style="`height:${(d[s.key] / top) * 100}%;background:${PURPOSE_COLOR[s.key]};${d[s.key] > 0 ? 'margin-top:2px;min-height:2px' : ''}`" />
              <div v-if="hover === i" class="absolute bottom-full mb-2 z-20 pointer-events-none rounded-xl bg-[#11132a] border border-white/10 px-3 py-2 shadow-xl whitespace-nowrap" :class="tipSide(i)">
                <p class="text-[10px] font-bold text-white/50 mb-1">{{ dayLabel(d.day) }}</p>
                <p class="text-sm font-black text-white mb-1">{{ rub(d.total) }} <span class="text-[10px] font-semibold text-white/40">· {{ d.count }} {{ t('payments') }}</span></p>
                <p v-for="s in SERIES" :key="s.key" class="flex items-center gap-1.5 text-[11px] text-white/60">
                  <span class="w-3 h-0.5 rounded" :style="`background:${PURPOSE_COLOR[s.key]}`" />{{ t(s.label) }}
                  <span class="ml-auto pl-3 font-bold text-white tabular-nums">{{ rub(d[s.key]) }}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <div class="flex gap-[2px] mt-1.5" aria-hidden="true">
          <span v-for="(d, i) in days" :key="d.day" class="flex-1 text-[10px] text-white/35 text-center whitespace-nowrap overflow-visible">
            <template v-if="i % labelEvery === 0">{{ dayLabel(d.day) }}</template>
          </span>
        </div>
      </div>
    </div>

    <div v-else class="max-h-72 overflow-auto rounded-xl border border-white/[0.06]">
      <table class="w-full text-xs tabular-nums">
        <thead class="sticky top-0 bg-brand-card text-white/40 text-[10px] uppercase tracking-wider">
          <tr><th class="text-left font-bold px-3 py-2">{{ t('colDay') }}</th>
            <th v-for="s in SERIES" :key="s.key" class="text-right font-bold px-3 py-2">{{ t(s.label) }}</th>
            <th class="text-right font-bold px-3 py-2">{{ t('colTotal') }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="d in [...days].reverse()" :key="d.day" class="border-t border-white/[0.05] text-white/80">
            <td class="px-3 py-1.5">{{ dayLabel(d.day) }}</td>
            <td v-for="s in SERIES" :key="s.key" class="px-3 py-1.5 text-right">{{ rub(d[s.key]) }}</td>
            <td class="px-3 py-1.5 text-right font-bold text-white">{{ rub(d.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
