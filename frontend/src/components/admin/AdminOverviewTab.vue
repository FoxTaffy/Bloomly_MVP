<script setup lang="ts">
import { ref, computed } from 'vue'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'
import AdminStatisticsTab from './AdminStatisticsTab.vue'
import { roleLabel, roleColor, formatNum, formatMonthShort } from './adminHelpers'
import { useAdminContext, type UsersView } from './adminContext'

const langStore = useLangStore()
const { usersView, switchTab, stats, isLoadingStats, statsError, fetchStats, networkStats } = useAdminContext()

const statCards = computed(() => stats.value ? [
  { label: langStore.t.adminStatTotalUsers,   icon: 'Users',       color: '#4C67CF', value: formatNum(stats.value.users.total),          sub: `+${stats.value.users.today} ${langStore.t.adminSubToday}` },
  { label: langStore.t.adminStatNewToday,     icon: 'UserPlus',    color: '#10b981', value: formatNum(stats.value.users.today),          sub: `+${stats.value.users.week} ${langStore.t.adminSubThisWeek}` },
  { label: langStore.t.adminStatWithSub,      icon: 'Sparkles',    color: '#a78bfa', value: formatNum(stats.value.premiumSubscribers),   sub: `${langStore.t.adminSubOutOf} ${formatNum(stats.value.users.total)} ${langStore.t.adminSubUsersGenitive}` },
  { label: langStore.t.adminStatTotalPosts,   icon: 'FileText',    color: '#22d3ee', value: formatNum(stats.value.posts.total),          sub: `+${stats.value.posts.week} ${langStore.t.adminSubThisWeek}` },
  { label: langStore.t.adminStatPostsToday,   icon: 'FilePlus2',   color: '#f59e0b', value: formatNum(stats.value.posts.today),          sub: langStore.t.adminSubPublications },
  { label: langStore.t.adminStatReportsQueue, icon: 'Flag',        color: '#f43f5e', value: formatNum(stats.value.moderation.pendingReports), sub: langStore.t.adminSubAwaitingReview },
] : [])

// ── Growth charts — cumulative totals reconstructed from last-12-months deltas

const buildCumulative = (rows: { month: string; count: number }[] | undefined, endTotal: number) => {
  if (!rows?.length) return []
  const sum = rows.reduce((s, r) => s + r.count, 0)
  let running = endTotal - sum
  return rows.map(r => { running += r.count; return { month: r.month, total: running } })
}
// 'loading' | 'error' | 'empty' | 'ok' — one state per chart so the card never renders blank
const growthState = (rows: { count: number }[] | undefined, total: number | undefined) => {
  if (!stats.value) return isLoadingStats.value ? 'loading' : statsError.value ? 'error' : 'loading'
  if (!rows?.length || (!total && !rows.some(r => r.count > 0))) return 'empty'
  return 'ok'
}
const userGrowthState = computed(() => growthState(stats.value?.userGrowth, stats.value?.users?.total))
const postGrowthState = computed(() => growthState(stats.value?.postGrowth, stats.value?.posts?.total))
const userGrowthSeries = computed(() => buildCumulative(stats.value?.userGrowth, stats.value?.users.total ?? 0))
const postGrowthSeries = computed(() => buildCumulative(stats.value?.postGrowth, stats.value?.posts.total ?? 0))
const userGrowthMax = computed(() => Math.max(...userGrowthSeries.value.map(p => p.total), 1))
const userGrowthMin = computed(() => Math.min(...userGrowthSeries.value.map(p => p.total), userGrowthMax.value))
const postGrowthMax = computed(() => Math.max(...postGrowthSeries.value.map(p => p.total), 1))
const postGrowthMin = computed(() => Math.min(...postGrowthSeries.value.map(p => p.total), postGrowthMax.value))

// SVG polyline points for a simple area/line chart, normalised into a 0..300 x 0..100 viewBox
const buildLineCoords = (series: { month: string; total: number }[], min: number, max: number) => {
  if (series.length < 2) return []
  const range = Math.max(max - min, 1)
  return series.map((p, i) => {
    const x = (i / (series.length - 1)) * 300
    const y = 100 - ((p.total - min) / range) * 92 - 4
    return { x, y, month: p.month, total: p.total }
  })
}
const userGrowthCoords = computed(() => buildLineCoords(userGrowthSeries.value, userGrowthMin.value, userGrowthMax.value))
const postGrowthCoords = computed(() => buildLineCoords(postGrowthSeries.value, postGrowthMin.value, postGrowthMax.value))
const userGrowthPoints = computed(() => userGrowthCoords.value.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '))
const postGrowthPoints = computed(() => postGrowthCoords.value.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '))

const hoveredGrowthPoint = ref<{ chart: 'users' | 'posts'; index: number } | null>(null)
const activeGrowthTooltip = computed(() => {
  if (!hoveredGrowthPoint.value) return null
  const { chart, index } = hoveredGrowthPoint.value
  const coord = (chart === 'users' ? userGrowthCoords.value : postGrowthCoords.value)[index]
  if (!coord) return null
  return { left: (coord.x / 300) * 100, top: coord.y, month: coord.month, total: coord.total }
})

const hoveredActivityBar = ref<{ row: string; index: number } | null>(null)
const formatWeekday = (d: string) => {
  const label = new Date(d).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { weekday: 'short', day: 'numeric', month: 'short' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// ── Weekly activity — posts / likes / comments per day, last 7 days
const weeklyActivityRows = computed(() => {
  const wa = stats.value?.weeklyActivity
  if (!wa) return []
  const rows = [
    { label: langStore.t.postsTab,   color: '#4C67CF', days: wa.posts },
    { label: langStore.t.adminLikesLabel, color: '#f7a9e2', days: wa.likes },
    { label: langStore.t.comments,   color: '#cd83f5', days: wa.comments },
  ]
  return rows.map(r => ({
    ...r,
    total: r.days.reduce((s: number, d: any) => s + d.count, 0),
    max: Math.max(...r.days.map((d: any) => d.count), 1),
  }))
})

// ── Geography — top countries by user count (from /admin/stats/network)
// "Не указана" is the unspecified bucket — excluded so the ranking only reflects known countries
const topCountries = computed(() => {
  const rows = (networkStats.value?.usersByCountry ?? []).filter((r: any) => r.label && r.label !== 'null' && r.label !== 'Не указана')
  const total = rows.reduce((s: number, r: any) => s + r.value, 0) || 1
  return rows.slice(0, 5).map((r: any) => ({ ...r, pct: Math.round((r.value / total) * 100) }))
})

// ── Reports by AutoMod category
const REPORT_CATEGORY_LABEL = computed<Record<string, string>>(() => ({
  spam: langStore.t.adminCategorySpam, toxic: langStore.t.adminCategoryToxic, duplicate: langStore.t.adminCategoryDuplicate, fraud: langStore.t.adminCategoryFraud,
  suspicious: langStore.t.adminCategorySuspicious, manual: langStore.t.adminCategoryManual, other: langStore.t.other,
}))
const topReportCategories = computed(() => {
  const rows = stats.value?.reportsByCategory ?? []
  const max = Math.max(...rows.map((r: any) => r.count), 1)
  return rows.slice(0, 5).map((r: any) => ({ ...r, label: REPORT_CATEGORY_LABEL.value[r.category] ?? r.category, pct: Math.round((r.count / max) * 100) }))
})

// Moderation snapshot — the things staff act on first (freezes, bans, reports, automod)
const modSnapshot = computed(() => stats.value ? [
  { tab: 'reports'      as const, usersView: undefined as UsersView | undefined, label: langStore.t.adminStatReportsQueue, icon: 'Flag',        color: '#f59e0b', value: stats.value.moderation.pendingReports },
  { tab: 'users'        as const, usersView: 'frozen' as UsersView | undefined,  label: langStore.t.adminNavFrozen,        icon: 'Snowflake',   color: '#38bdf8', value: stats.value.moderation.frozenUsers },
  { tab: 'automod'      as const, usersView: undefined as UsersView | undefined, label: `AutoMod ${langStore.t.adminLast24h}`, icon: 'ShieldAlert', color: '#ef4444', value: stats.value.moderation.autoModFlags24h },
  { tab: 'verification' as const, usersView: undefined as UsersView | undefined, label: langStore.t.secVerification,       icon: 'BadgeCheck',  color: '#2dd4bf', value: stats.value.moderation.pendingVerification },
] : [])
</script>

<template>
  <div>
    <!-- Skeleton -->
    <div v-if="isLoadingStats" class="stack-y-5">
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div v-for="n in 6" :key="n" class="h-28 rounded-2xl bg-white/5 animate-pulse" />
      </div>
      <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
    </div>

    <div v-else-if="statsError && !stats" class="flex flex-col items-center gap-3 py-20 text-white/30">
      <p class="text-sm font-semibold">{{ langStore.t.adminLoadFailed }}</p>
      <button @click="fetchStats" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/8 text-white/60 hover:text-white transition-all">{{ langStore.t.adminRetryBtn }}</button>
    </div>

    <template v-else-if="stats">
      <!-- Moderation snapshot — the queue staff actually work from -->
      <div class="flex items-center gap-2 mb-3">
        <span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
        <h2 class="text-xs font-extrabold text-white/50 tracking-[0.15em] uppercase">{{ langStore.t.adminRequiresAttention }}</h2>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <button v-for="mc in modSnapshot" :key="mc.label" @click="switchTab(mc.tab, { usersView: mc.usersView })"
          class="relative text-left rounded-2xl p-4 overflow-hidden border transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-lg"
          :style="`background:${mc.color}0d;border-color:${mc.color}25`">
          <div class="flex items-center justify-between mb-2.5">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110" :style="`background:${mc.color}20`">
              <BIcon :name="mc.icon" class="w-4 h-4" :style="`color:${mc.color}`" />
            </div>
            <BIcon name="ArrowUpRight" class="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
          </div>
          <p class="text-2xl font-black text-white">{{ mc.value }}</p>
          <p class="text-xs text-white/45 mt-0.5 font-semibold">{{ mc.label }}</p>
        </button>
      </div>

      <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">{{ langStore.t.adminGeneralStats }}</h2>
      <!-- Stat cards -->
      <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <div v-for="sc in statCards" :key="sc.label"
          class="relative rounded-2xl p-4 border border-brand-border bg-brand-card hover:border-white/20 transition-all duration-200">
          <div class="flex items-center justify-between mb-3">
            <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ sc.label }}</p>
            <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" :style="`background:${sc.color}20`">
              <BIcon :name="sc.icon" class="w-3.5 h-3.5" :style="`color:${sc.color}`" />
            </div>
          </div>
          <p class="text-2xl font-black text-white">{{ sc.value }}</p>
          <p class="text-xs font-semibold mt-1" :style="`color:${sc.color}`">{{ sc.sub }}</p>
        </div>
      </div>

      <!-- Growth charts -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm">{{ langStore.t.adminUserGrowthTitle }}</h3>
          <p class="text-xs text-white/40 mt-0.5 mb-4">{{ langStore.t.adminUserGrowthSub }}</p>
          <template v-if="userGrowthState === 'ok'">
          <div class="relative">
            <div v-if="activeGrowthTooltip && hoveredGrowthPoint?.chart === 'users'"
              class="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none flex flex-col items-center"
              :style="`left:${activeGrowthTooltip.left}%;top:${activeGrowthTooltip.top}%;margin-top:-10px`">
              <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0B1030]/95 backdrop-blur-xs border border-brand-accent/30 shadow-lg shadow-black/40 whitespace-nowrap">
                <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:#4C67CF" />
                <div class="leading-tight">
                  <p class="text-[9px] text-white/45 font-semibold capitalize">{{ formatMonthShort(activeGrowthTooltip.month) }}</p>
                  <p class="text-xs font-black text-white">{{ formatNum(activeGrowthTooltip.total) }}</p>
                </div>
              </div>
              <div class="w-2 h-2 rotate-45 -mt-1 bg-[#0B1030]/95 border-r border-b border-brand-accent/30" />
            </div>
            <svg viewBox="0 0 300 100" preserveAspectRatio="none" class="w-full h-32">
              <polygon v-if="userGrowthPoints" :points="`0,100 ${userGrowthPoints} 300,100`" fill="url(#ov-grad-users)" />
              <polyline v-if="userGrowthPoints" :points="userGrowthPoints" fill="none" stroke="#4C67CF" stroke-width="2" vector-effect="non-scaling-stroke" />
              <defs>
                <linearGradient id="ov-grad-users" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#4C67CF" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="#4C67CF" stop-opacity="0" />
                </linearGradient>
              </defs>
              <line v-for="gy in [22, 50, 78]" :key="gy" x1="0" x2="300" :y1="gy" :y2="gy" stroke="white" stroke-opacity="0.06" stroke-width="1" vector-effect="non-scaling-stroke" />
              <line v-if="hoveredGrowthPoint?.chart === 'users'" :x1="userGrowthCoords[hoveredGrowthPoint.index]?.x" :x2="userGrowthCoords[hoveredGrowthPoint.index]?.x"
                y1="4" y2="100" stroke="#4C67CF" stroke-width="1" stroke-dasharray="3,3" opacity="0.3" vector-effect="non-scaling-stroke" />
              <g v-for="(c, i) in userGrowthCoords" :key="i">
                <circle v-if="hoveredGrowthPoint?.chart === 'users' && hoveredGrowthPoint?.index === i"
                  :cx="c.x" :cy="c.y" r="6" fill="#4C67CF" opacity="0.2" />
                <circle :cx="c.x" :cy="c.y" :r="hoveredGrowthPoint?.chart === 'users' && hoveredGrowthPoint?.index === i ? 3 : 2.25"
                  fill="#4C67CF" stroke="#0B1030" stroke-width="1.5" vector-effect="non-scaling-stroke" class="transition-all" />
                <circle :cx="c.x" :cy="c.y" r="8" fill="transparent" class="cursor-pointer"
                  @mouseenter="hoveredGrowthPoint = { chart: 'users', index: i }"
                  @mouseleave="hoveredGrowthPoint = null" />
              </g>
            </svg>
          </div>
          <div class="flex justify-between mt-1">
            <span v-for="(p, i) in userGrowthSeries" :key="i" class="text-[9px] text-white/25" :class="i % 2 === 1 ? 'hidden sm:inline' : ''">{{ formatMonthShort(p.month) }}</span>
          </div>
          </template>
          <div v-else class="h-32 flex flex-col items-center justify-center gap-2 text-white/30">
            <div v-if="userGrowthState === 'loading'" class="w-full h-full rounded-xl bg-white/5 animate-pulse" />
            <template v-else-if="userGrowthState === 'error'">
              <p class="text-xs font-semibold">{{ langStore.t.adminLoadFailed }}</p>
              <button @click="fetchStats" class="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/8 text-white/60 hover:text-white transition-all">{{ langStore.t.adminRetryBtn }}</button>
            </template>
            <template v-else>
              <BIcon name="BarChart2" class="w-7 h-7 opacity-40" />
              <p class="text-xs font-semibold">{{ langStore.t.adminChartNoData }}</p>
            </template>
          </div>
        </div>
        <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm">{{ langStore.t.adminPostGrowthTitle }}</h3>
          <p class="text-xs text-white/40 mt-0.5 mb-4">{{ langStore.t.adminPostGrowthSub }}</p>
          <template v-if="postGrowthState === 'ok'">
          <div class="relative">
            <div v-if="activeGrowthTooltip && hoveredGrowthPoint?.chart === 'posts'"
              class="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none flex flex-col items-center"
              :style="`left:${activeGrowthTooltip.left}%;top:${activeGrowthTooltip.top}%;margin-top:-10px`">
              <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0B1030]/95 backdrop-blur-xs border border-brand-success/30 shadow-lg shadow-black/40 whitespace-nowrap">
                <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:#66C770" />
                <div class="leading-tight">
                  <p class="text-[9px] text-white/45 font-semibold capitalize">{{ formatMonthShort(activeGrowthTooltip.month) }}</p>
                  <p class="text-xs font-black text-white">{{ formatNum(activeGrowthTooltip.total) }}</p>
                </div>
              </div>
              <div class="w-2 h-2 rotate-45 -mt-1 bg-[#0B1030]/95 border-r border-b border-brand-success/30" />
            </div>
            <svg viewBox="0 0 300 100" preserveAspectRatio="none" class="w-full h-32">
              <polygon v-if="postGrowthPoints" :points="`0,100 ${postGrowthPoints} 300,100`" fill="url(#ov-grad-posts)" />
              <polyline v-if="postGrowthPoints" :points="postGrowthPoints" fill="none" stroke="#66C770" stroke-width="2" vector-effect="non-scaling-stroke" />
              <defs>
                <linearGradient id="ov-grad-posts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#66C770" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="#66C770" stop-opacity="0" />
                </linearGradient>
              </defs>
              <line v-for="gy in [22, 50, 78]" :key="gy" x1="0" x2="300" :y1="gy" :y2="gy" stroke="white" stroke-opacity="0.06" stroke-width="1" vector-effect="non-scaling-stroke" />
              <line v-if="hoveredGrowthPoint?.chart === 'posts'" :x1="postGrowthCoords[hoveredGrowthPoint.index]?.x" :x2="postGrowthCoords[hoveredGrowthPoint.index]?.x"
                y1="4" y2="100" stroke="#66C770" stroke-width="1" stroke-dasharray="3,3" opacity="0.3" vector-effect="non-scaling-stroke" />
              <g v-for="(c, i) in postGrowthCoords" :key="i">
                <circle v-if="hoveredGrowthPoint?.chart === 'posts' && hoveredGrowthPoint?.index === i"
                  :cx="c.x" :cy="c.y" r="6" fill="#66C770" opacity="0.2" />
                <circle :cx="c.x" :cy="c.y" :r="hoveredGrowthPoint?.chart === 'posts' && hoveredGrowthPoint?.index === i ? 3 : 2.25"
                  fill="#66C770" stroke="#0B1030" stroke-width="1.5" vector-effect="non-scaling-stroke" class="transition-all" />
                <circle :cx="c.x" :cy="c.y" r="8" fill="transparent" class="cursor-pointer"
                  @mouseenter="hoveredGrowthPoint = { chart: 'posts', index: i }"
                  @mouseleave="hoveredGrowthPoint = null" />
              </g>
            </svg>
          </div>
          <div class="flex justify-between mt-1">
            <span v-for="(p, i) in postGrowthSeries" :key="i" class="text-[9px] text-white/25" :class="i % 2 === 1 ? 'hidden sm:inline' : ''">{{ formatMonthShort(p.month) }}</span>
          </div>
          </template>
          <div v-else class="h-32 flex flex-col items-center justify-center gap-2 text-white/30">
            <div v-if="postGrowthState === 'loading'" class="w-full h-full rounded-xl bg-white/5 animate-pulse" />
            <template v-else-if="postGrowthState === 'error'">
              <p class="text-xs font-semibold">{{ langStore.t.adminLoadFailed }}</p>
              <button @click="fetchStats" class="px-3 py-1 rounded-lg text-xs font-bold bg-white/5 border border-white/8 text-white/60 hover:text-white transition-all">{{ langStore.t.adminRetryBtn }}</button>
            </template>
            <template v-else>
              <BIcon name="BarChart2" class="w-7 h-7 opacity-40" />
              <p class="text-xs font-semibold">{{ langStore.t.adminChartNoData }}</p>
            </template>
          </div>
        </div>
      </div>

      <!-- Weekly activity / geography / reports breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminWeeklyActivityTitle }}</h3>
          <div v-for="row in weeklyActivityRows" :key="row.label" class="mb-5 last:mb-0">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-xs font-semibold text-white/60">{{ row.label }}</span>
              <span class="text-sm font-black text-white">{{ formatNum(row.total) }}</span>
            </div>
            <div class="relative flex items-end gap-1 h-10">
              <div v-if="hoveredActivityBar?.row === row.label"
                class="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none flex flex-col items-center"
                :style="`left:${((hoveredActivityBar.index + 0.5) / row.days.length) * 100}%;bottom:calc(${Math.max(6, (row.days[hoveredActivityBar.index].count / row.max) * 100)}% + 8px)`">
                <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0B1030]/95 backdrop-blur-xs border shadow-lg shadow-black/40 whitespace-nowrap"
                  :style="`border-color:${row.color}4d`">
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" :style="`background:${row.color}`" />
                  <div class="leading-tight">
                    <p class="text-[9px] text-white/45 font-semibold">{{ formatWeekday(row.days[hoveredActivityBar.index].day) }}</p>
                    <p class="text-xs font-black text-white">{{ formatNum(row.days[hoveredActivityBar.index].count) }}</p>
                  </div>
                </div>
                <div class="w-2 h-2 rotate-45 -mt-1 bg-[#0B1030]/95 border-r border-b" :style="`border-color:${row.color}4d`" />
              </div>
              <div v-for="(d, i) in row.days" :key="i" class="relative flex-1 h-full flex items-end cursor-pointer"
                @mouseenter="hoveredActivityBar = { row: row.label, index: i }"
                @mouseleave="hoveredActivityBar = null">
                <div class="w-full rounded-t-md transition-all duration-150"
                  :style="`height:${Math.max(6, (d.count / row.max) * 100)}%;background:${row.color};opacity:${!hoveredActivityBar || hoveredActivityBar.row !== row.label || hoveredActivityBar.index === i ? 1 : 0.35}`" />
              </div>
            </div>
          </div>
          <p v-if="!weeklyActivityRows.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoDataLabel }}</p>
        </div>

        <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminUserGeographyTitle }}</h3>
          <div v-for="c in topCountries" :key="c.label" class="mb-3 last:mb-0">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold text-white/60">{{ c.label }}</span>
              <span class="text-xs font-bold text-white">{{ c.pct }}%</span>
            </div>
            <div class="h-1.5 rounded-full bg-white/6 overflow-hidden">
              <div class="h-full rounded-full bg-brand-accent" :style="`width:${c.pct}%`" />
            </div>
          </div>
          <p v-if="!topCountries.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoDataLabel }}</p>
        </div>

        <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminReportsByCategoryTitle }}</h3>
          <div v-for="r in topReportCategories" :key="r.category" class="mb-3 last:mb-0">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold text-white/60">{{ r.label }}</span>
              <span class="text-xs font-bold text-white">{{ r.count }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-white/6 overflow-hidden">
              <div class="h-full rounded-full bg-brand-warning" :style="`width:${r.pct}%`" />
            </div>
          </div>
          <p v-if="!topReportCategories.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoReportsYet }}</p>
        </div>
      </div>

      <!-- Roles -->
      <div class="rounded-2xl border border-brand-border bg-brand-card p-6">
        <h3 class="font-extrabold text-sm text-white mb-4 flex items-center gap-2">
          <BIcon name="Users" class="w-4 h-4 text-white/40" /> {{ langStore.t.adminRoleDistribution }}
        </h3>
        <div class="flex flex-wrap gap-3">
          <div v-for="rb in stats.roleBreakdown" :key="rb.role"
            class="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-white/8"
            style="background:rgba(255,255,255,0.04)">
            <div class="w-2 h-2 rounded-full" :style="`background:${roleColor(rb.role)}`" />
            <span class="text-sm font-black text-white">{{ rb.count }}</span>
            <span class="text-xs text-white/45">{{ roleLabel(rb.role) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- Statistics — merged from the former separate tab, same look -->
    <div class="flex items-center gap-2 mt-10 mb-4">
      <BIcon name="BarChart2" class="w-4 h-4 text-emerald-400" />
      <h2 class="text-xs font-extrabold text-white/50 tracking-[0.15em] uppercase">{{ langStore.t.statsTab }}</h2>
    </div>
    <AdminStatisticsTab />
  </div>
</template>
