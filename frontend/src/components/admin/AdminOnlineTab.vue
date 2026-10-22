<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import api from '@/api'
import { apiErrorMessage } from '@/lib/apiError'
import BIcon from '@/components/BIcon.vue'

// «Онлайн сейчас» опрашивается каждые 15 с (heart-beat), суточная аналитика — раз в минуту.
// Замеры пишет cron на бэкенде (backend/src/modules/admin/online.service.ts).
interface Live { online: number; server_time: string; recent: { at: string; online: number }[] }
interface HourStat { hour: number; avg: number; peak: number; peak_at: string | null; days: number }
interface DayStat { day: string; avg: number; peak: number; peak_at: string }
interface Daily {
  timezone: string; hourly: HourStat[]; daily: DayStat[]
  summary: { samples: number; since: string | null; avg_online: number; peak: { online: number; at: string } | null; busiest_hour: { hour: number; avg: number } | null }
}

const LIVE_MS = 15_000
const DAILY_MS = 60_000

const live = ref<Live | null>(null)
const daily = ref<Daily | null>(null)
const error = ref('')
const updatedAt = ref<Date | null>(null)
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone

async function loadLive() {
  try {
    const res = await api.get('/admin/online/live')
    live.value = res.data.data
    updatedAt.value = new Date()
    error.value = ''
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось получить данные онлайна'
  }
}
async function loadDaily() {
  try {
    const res = await api.get('/admin/online/daily', { params: { tz } })
    daily.value = res.data.data
  } catch (e) {
    error.value = apiErrorMessage(e) ?? 'Не удалось загрузить аналитику'
  }
}

let liveTimer: ReturnType<typeof setInterval> | undefined
let dailyTimer: ReturnType<typeof setInterval> | undefined
const tick = () => { if (!document.hidden) loadLive() }
onMounted(() => {
  loadLive(); loadDaily()
  liveTimer = setInterval(tick, LIVE_MS)
  dailyTimer = setInterval(() => { if (!document.hidden) loadDaily() }, DAILY_MS)
  document.addEventListener('visibilitychange', tick)
})
onBeforeUnmount(() => {
  clearInterval(liveTimer); clearInterval(dailyTimer)
  document.removeEventListener('visibilitychange', tick)
})

// ── Форматирование ───────────────────────────────────────────────────────────
const fmtDateTime = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: daily.value?.timezone })
  : '—'
const fmtDay = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', weekday: 'short' })
const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59`

// ── График по часам (SVG: столбцы = среднее, линия = пик) ────────────────────
const W = 720, H = 240, PL = 36, PR = 8, PT = 12, PB = 26
const hourly = computed(() => daily.value?.hourly ?? [])
const maxY = computed(() => {
  const m = Math.max(1, ...hourly.value.map((h) => h.peak))
  const step = m <= 5 ? 1 : m <= 20 ? 5 : m <= 100 ? 10 : 50
  return Math.ceil(m / step) * step
})
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(maxY.value * k)))
const plotW = W - PL - PR, plotH = H - PT - PB
const y = (v: number) => PT + plotH - (v / maxY.value) * plotH
const slot = plotW / 24
const peakPath = computed(() => hourly.value.map((h, i) => `${i ? 'L' : 'M'}${(PL + slot * i + slot / 2).toFixed(1)},${y(h.peak).toFixed(1)}`).join(' '))
const hover = ref<number | null>(null)

// ── Мини-график последнего часа ──────────────────────────────────────────────
const spark = computed(() => {
  const pts = live.value?.recent ?? []
  if (pts.length < 2) return ''
  const max = Math.max(1, ...pts.map((p) => p.online))
  const t0 = new Date(pts[0].at).getTime(), span = Math.max(1, new Date(pts[pts.length - 1].at).getTime() - t0)
  return pts.map((p, i) => `${i ? 'L' : 'M'}${(((new Date(p.at).getTime() - t0) / span) * 300).toFixed(1)},${(40 - (p.online / max) * 36).toFixed(1)}`).join(' ')
})
</script>

<template>
  <div class="space-y-5">
    <p v-if="error" role="alert" class="text-xs text-brand-error">{{ error }}</p>

    <!-- Live -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <div class="rounded-2xl border border-brand-border p-5 flex flex-col justify-between" style="background:#1F223C">
        <div>
          <p class="text-[11px] font-bold text-white/40 uppercase tracking-wide flex items-center gap-2">
            <span class="relative flex w-2 h-2"><span class="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60"></span><span class="relative w-2 h-2 rounded-full bg-emerald-400"></span></span>
            Онлайн сейчас
          </p>
          <p class="text-5xl font-black text-white mt-2 tabular-nums" aria-live="polite">{{ live ? live.online : '…' }}</p>
        </div>
        <p class="text-[11px] text-white/40 mt-3">
          Обновляется каждые {{ LIVE_MS / 1000 }} с<template v-if="updatedAt"> · {{ updatedAt.toLocaleTimeString('ru-RU') }}</template>
        </p>
      </div>
      <div class="lg:col-span-2 rounded-2xl border border-brand-border p-5" style="background:#1F223C">
        <p class="text-[11px] font-bold text-white/40 uppercase tracking-wide mb-2">Последний час</p>
        <svg v-if="spark" viewBox="0 0 300 44" class="w-full h-16" preserveAspectRatio="none" role="img" aria-label="Онлайн за последний час">
          <path :d="spark" fill="none" stroke="#2dd4bf" stroke-width="1.5" vector-effect="non-scaling-stroke" />
        </svg>
        <p v-else class="text-xs text-white/40 py-5">Данные появятся после первых замеров (раз в минуту).</p>
      </div>
    </div>

    <!-- Сводка -->
    <div v-if="daily" class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div v-for="c in [
        { label: 'Пик за всё время', value: daily.summary.peak ? daily.summary.peak.online : '—', hint: daily.summary.peak ? fmtDateTime(daily.summary.peak.at) : 'нет данных' },
        { label: 'Среднее онлайн', value: daily.summary.avg_online, hint: 'по всем замерам' },
        { label: 'Самый активный час', value: daily.summary.busiest_hour ? `${String(daily.summary.busiest_hour.hour).padStart(2, '0')}:00` : '—', hint: daily.summary.busiest_hour ? `в среднем ${daily.summary.busiest_hour.avg} онлайн` : 'нет данных' },
        { label: 'Статистика ведётся с', value: daily.summary.since ? new Date(daily.summary.since).toLocaleDateString('ru-RU') : '—', hint: `${daily.summary.samples} замеров` },
      ]" :key="c.label" class="rounded-2xl border border-brand-border p-4" style="background:#1F223C">
        <p class="text-[11px] font-bold text-white/40 uppercase tracking-wide">{{ c.label }}</p>
        <p class="text-2xl font-black text-white mt-1 tabular-nums">{{ c.value }}</p>
        <p class="text-[11px] text-white/40 mt-0.5">{{ c.hint }}</p>
      </div>
    </div>

    <!-- График по часам суток -->
    <div v-if="daily" class="rounded-2xl border border-brand-border p-5" style="background:#1F223C">
      <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 class="text-sm font-bold text-white">Активность по часам суток</h3>
        <p class="text-[11px] text-white/40">Часовой пояс: {{ daily.timezone }}</p>
      </div>
      <div class="flex items-center gap-4 text-[11px] text-white/50 mb-2">
        <span class="inline-flex items-center gap-1.5"><span class="w-3 h-3 rounded-sm" style="background:#4C67CF"></span>Среднее онлайн</span>
        <span class="inline-flex items-center gap-1.5"><span class="w-3 h-0.5" style="background:#f59e0b"></span>Пик</span>
      </div>
      <svg :viewBox="`0 0 ${W} ${H}`" class="w-full h-auto" role="img" aria-label="Среднее и пиковое число пользователей онлайн по часам суток" @mouseleave="hover = null">
        <g v-for="t in ticks" :key="t">
          <line :x1="PL" :x2="W - PR" :y1="y(t)" :y2="y(t)" stroke="rgba(255,255,255,0.08)" />
          <text :x="PL - 6" :y="y(t) + 3" text-anchor="end" font-size="10" fill="rgba(255,255,255,0.4)">{{ t }}</text>
        </g>
        <g v-for="(h, i) in hourly" :key="h.hour">
          <rect :x="PL + slot * i + 2" :y="y(h.avg)" :width="slot - 4" :height="Math.max(0, y(0) - y(h.avg))" rx="2"
            :fill="hover === i ? '#7b93ee' : '#4C67CF'" />
          <text v-if="i % 2 === 0" :x="PL + slot * i + slot / 2" :y="H - 8" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.4)">{{ String(h.hour).padStart(2, '0') }}</text>
          <rect :x="PL + slot * i" :y="PT" :width="slot" :height="plotH" fill="transparent" @mouseenter="hover = i" @focus="hover = i" />
        </g>
        <path :d="peakPath" fill="none" stroke="#f59e0b" stroke-width="1.5" />
        <circle v-for="(h, i) in hourly" :key="'p' + h.hour" :cx="PL + slot * i + slot / 2" :cy="y(h.peak)" r="2.5" fill="#f59e0b" />
      </svg>
      <p class="text-xs text-white/60 mt-2 min-h-4">
        <template v-if="hover !== null && hourly[hover]">
          <b class="text-white">{{ hourLabel(hourly[hover].hour) }}</b> · среднее {{ hourly[hover].avg }} · пик {{ hourly[hover].peak }}
          <template v-if="hourly[hover].peak_at"> ({{ fmtDateTime(hourly[hover].peak_at) }})</template>
        </template>
      </p>
    </div>

    <!-- Таблица по часам -->
    <div v-if="daily" class="rounded-2xl border border-brand-border overflow-hidden" style="background:#1F223C">
      <div class="px-5 py-3 border-b border-brand-border"><h3 class="text-sm font-bold text-white">Сводка по часам</h3></div>
      <div class="overflow-x-auto max-h-96">
        <table class="w-full text-xs text-left">
          <thead class="text-white/40 uppercase text-[10px] sticky top-0" style="background:#1F223C">
            <tr><th class="px-5 py-2">Час</th><th class="px-3 py-2">Среднее</th><th class="px-3 py-2">Пик</th><th class="px-3 py-2">Когда был пик</th><th class="px-3 py-2">Дней данных</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in hourly" :key="h.hour" class="border-t border-brand-border/60 text-white/80">
              <td class="px-5 py-2 font-semibold text-white">{{ hourLabel(h.hour) }}</td>
              <td class="px-3 py-2 tabular-nums">{{ h.avg }}</td>
              <td class="px-3 py-2 tabular-nums font-bold" :class="h.peak && h.peak === daily.summary.peak?.online ? 'text-amber-400' : ''">{{ h.peak }}</td>
              <td class="px-3 py-2 text-white/60">{{ fmtDateTime(h.peak_at) }}</td>
              <td class="px-3 py-2 tabular-nums text-white/60">{{ h.days }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- По дням -->
    <div v-if="daily && daily.daily.length" class="rounded-2xl border border-brand-border overflow-hidden" style="background:#1F223C">
      <div class="px-5 py-3 border-b border-brand-border"><h3 class="text-sm font-bold text-white">Последние дни</h3></div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-left">
          <thead class="text-white/40 uppercase text-[10px]">
            <tr><th class="px-5 py-2">День</th><th class="px-3 py-2">Среднее</th><th class="px-3 py-2">Пик</th><th class="px-3 py-2">Время пика</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in daily.daily" :key="d.day" class="border-t border-brand-border/60 text-white/80">
              <td class="px-5 py-2 font-semibold text-white">{{ fmtDay(d.day) }}</td>
              <td class="px-3 py-2 tabular-nums">{{ d.avg }}</td>
              <td class="px-3 py-2 tabular-nums font-bold">{{ d.peak }}</td>
              <td class="px-3 py-2 text-white/60">{{ fmtDateTime(d.peak_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p v-if="!daily && !error" class="text-xs text-white/40">Загрузка…</p>
  </div>
</template>
