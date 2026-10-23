<script setup lang="ts">
import { computed } from 'vue'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'
import AdminStatisticsTab from './AdminStatisticsTab.vue'
import AdminAgentsCard from './AdminAgentsCard.vue'
import AdminGrowthChart from './AdminGrowthChart.vue'
import { roleLabel, roleColor, formatNum, formatMonthShort, ROLE_RANK } from './adminHelpers'
import { useAdminContext, type AdminTab, type StatsSubTab, type UsersView } from './adminContext'

const langStore = useLangStore()
const { switchTab, myRoleRank, statsSubTab, stats, isLoadingStats, statsError, fetchStats, badges } = useAdminContext()
const isAdminPlus = computed(() => myRoleRank.value >= ROLE_RANK.admin)

type Target = { tab: AdminTab; usersView?: UsersView; statsSubTab?: StatsSubTab }
const open = (c: Target) => {
  if (c.statsSubTab) {
    statsSubTab.value = c.statsSubTab
    document.getElementById('admin-statistics')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  switchTab(c.tab, { usersView: c.usersView })
}

// ── Требует внимания: очереди, которые разбирает команда ──────────────────
const attention = computed(() => {
  const st = stats.value
  if (!st) return []
  const t = langStore.t
  const list: (Target & { label: string; hint: string; icon: string; color: string; value: number })[] = [
    { tab: 'reports',      label: t.adminStatReportsQueue, hint: 'ждут решения',        icon: 'Flag',        color: '#f59e0b', value: st.moderation.pendingReports },
    { tab: 'support',      label: t.adminNavSupport,       hint: 'открытых обращений',  icon: 'LifeBuoy',    color: '#60a5fa', value: st.sections?.supportOpen ?? badges.support },
    { tab: 'verification', label: t.secVerification,       hint: 'заявок на проверке',  icon: 'BadgeCheck',  color: '#2dd4bf', value: st.moderation.pendingVerification },
    { tab: 'automod',      label: 'AutoMod',               hint: 'срабатываний за 24 ч', icon: 'ShieldAlert', color: '#f87171', value: st.moderation.autoModFlags24h },
  ]
  if (isAdminPlus.value) list.splice(3, 0, { tab: 'ads', label: t.adLabel, hint: 'заявок на проверке', icon: 'Megaphone', color: '#fb923c', value: st.moderation.pendingAds })
  return list
})
const allClear = computed(() => attention.value.length > 0 && attention.value.every(a => !a.value))

// ── Ключевые показатели ───────────────────────────────────────────────────
const cumulative = (rows: { month: string; count: number }[] | undefined, endTotal: number) => {
  if (!rows?.length) return []
  let running = endTotal - rows.reduce((s, r) => s + r.count, 0)
  return rows.map(r => ({ month: r.month, total: (running += r.count) }))
}
const userSeries = computed(() => cumulative(stats.value?.userGrowth, stats.value?.users.total ?? 0))
const postSeries = computed(() => cumulative(stats.value?.postGrowth, stats.value?.posts.total ?? 0))

const spark = (series: { total: number }[]) => {
  if (series.length < 2) return ''
  const vals = series.map(p => p.total)
  const min = Math.min(...vals), range = Math.max(Math.max(...vals) - min, 1)
  return vals.map((v, i) => `${((i / (vals.length - 1)) * 100).toFixed(1)},${(26 - ((v - min) / range) * 22).toFixed(1)}`).join(' ')
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

const kpis = computed(() => {
  const st = stats.value
  if (!st) return []
  const list: { label: string; value: string; sub: string; icon: string; color: string; target: Target; spark?: string }[] = [
    { label: 'Пользователи', value: formatNum(st.users.total), sub: `+${st.users.today} сегодня · +${st.users.week} за неделю`, icon: 'Users', color: '#6d83e8', target: { tab: 'users' }, spark: spark(userSeries.value) },
    { label: 'Публикации', value: formatNum(st.posts.total), sub: `+${st.posts.today} сегодня · +${st.posts.week} за неделю`, icon: 'FileText', color: '#22d3ee', target: { tab: 'posts' }, spark: spark(postSeries.value) },
    { label: 'Онлайн сейчас', value: formatNum(st.online ?? 0), sub: `${formatNum(st.activity?.day ?? 0)} за сутки · ${formatNum(st.activity?.week ?? 0)} за неделю`, icon: 'Activity', color: '#34d399', target: { tab: 'overview', statsSubTab: 'online' } },
  ]
  if (isAdminPlus.value) {
    list.push({ label: 'Подписчики', value: formatNum(st.premiumSubscribers), sub: `${pct(st.premiumSubscribers, st.users.total)}% аудитории`, icon: 'Sparkles', color: '#a78bfa', target: { tab: 'finance' } })
    if (st.finance) list.push({ label: 'Поступления, 30 дн.', value: `${formatNum(Math.round(st.finance.rub30d))} ₽`, sub: `${st.finance.payments30d} платежей`, icon: 'Wallet', color: '#fbbf24', target: { tab: 'finance' } })
  } else {
    list.push({ label: 'Активны за месяц', value: formatNum(st.activity?.month ?? 0), sub: `${pct(st.activity?.month ?? 0, st.users.total)}% аудитории`, icon: 'TrendingUp', color: '#a78bfa', target: { tab: 'users' } })
  }
  return list
})

// ── Динамика ───────────────────────────────────────────────────────────────
const growthState = (rows: { count: number }[] | undefined, total: number | undefined) => {
  if (!stats.value) return isLoadingStats.value ? 'loading' : statsError.value ? 'error' : 'loading'
  if (!rows?.length || (!total && !rows.some(r => r.count > 0))) return 'empty'
  return 'ok'
}
const chartRows = (series: { month: string; total: number }[]) => series.map(p => ({ label: formatMonthShort(p.month), total: p.total }))
const userGrowthState = computed(() => growthState(stats.value?.userGrowth, stats.value?.users?.total))
const postGrowthState = computed(() => growthState(stats.value?.postGrowth, stats.value?.posts?.total))

// ── Активность за неделю: посты, лайки, комментарии по дням ───────────────
const weekly = computed(() => {
  const wa = stats.value?.weeklyActivity
  if (!wa) return null
  const series = [
    { key: 'posts',    label: langStore.t.postsTab,         color: '#4C67CF', days: wa.posts as { day: string; count: number }[] },
    { key: 'likes',    label: langStore.t.adminLikesLabel,  color: '#f7a9e2', days: wa.likes as { day: string; count: number }[] },
    { key: 'comments', label: langStore.t.comments,         color: '#cd83f5', days: wa.comments as { day: string; count: number }[] },
  ]
  const days = series[0].days.map((d, i) => ({
    day: d.day,
    values: series.map(s => ({ key: s.key, label: s.label, color: s.color, count: s.days[i]?.count ?? 0 })),
  }))
  const max = Math.max(...days.flatMap(d => d.values.map(v => v.count)), 1)
  return { series: series.map(s => ({ ...s, total: s.days.reduce((a, d) => a + d.count, 0) })), days, max }
})
const weekdayShort = (d: string) => new Date(d).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { weekday: 'short' })

// ── Здоровье аудитории ─────────────────────────────────────────────────────
const audience = computed(() => {
  const st = stats.value
  if (!st) return []
  const total = st.users.total
  return [
    { label: 'Подтвердили почту', value: pct(st.onboarding?.verifiedEmails ?? 0, total), color: '#34d399' },
    { label: 'Прошли онбординг', value: pct(st.onboarding?.onboarded ?? 0, total), color: '#6d83e8' },
    { label: 'Активны за месяц', value: pct(st.activity?.month ?? 0, total), color: '#f59e0b' },
  ]
})
const engagement = computed(() => {
  const st = stats.value
  if (!st) return []
  return [
    { label: 'Комментарии', value: formatNum(st.comments), icon: 'MessageCircle', color: '#cd83f5' },
    { label: 'Репосты', value: formatNum(st.repaws), icon: 'Repeat2', color: '#22d3ee' },
    { label: 'Подписки', value: formatNum(st.follows), icon: 'UserPlus', color: '#10b981' },
  ]
})

// ── Разделы платформы ──────────────────────────────────────────────────────
const sections = computed(() => {
  const st = stats.value
  if (!st) return []
  const sec = st.sections ?? {}
  const list: (Target & { label: string; value: string; sub: string; icon: string; color: string })[] = [
    { tab: 'groups', label: langStore.t.adminNavGroupsEvents, value: formatNum(sec.groupsTotal ?? 0), sub: 'групп на платформе', icon: 'LayoutGrid', color: '#818cf8' },
  ]
  if (isAdminPlus.value) {
    list.push(
      { tab: 'shop', label: 'Bloomly Shop', value: formatNum(sec.shopPendingAccess ?? 0), sub: 'заявок на доступ к стикерам', icon: 'ShoppingBag', color: '#f59e0b' },
      { tab: 'den',  label: "Dealers' Den", value: formatNum(sec.denActiveListings ?? 0), sub: `лотов · ${sec.denOpenDisputes ?? 0} открытых споров`, icon: 'Store', color: '#fb923c' },
      { tab: 'ads',  label: langStore.t.adLabel, value: formatNum(st.ads?.active ?? 0), sub: 'активных объявлений', icon: 'Megaphone', color: '#f97316' },
    )
  }
  return list
})

// ── Жалобы по категориям ───────────────────────────────────────────────────
const REPORT_CATEGORY_LABEL = computed<Record<string, string>>(() => ({
  spam: langStore.t.adminCategorySpam, toxic: langStore.t.adminCategoryToxic, duplicate: langStore.t.adminCategoryDuplicate, fraud: langStore.t.adminCategoryFraud,
  suspicious: langStore.t.adminCategorySuspicious, manual: langStore.t.adminCategoryManual, other: langStore.t.other,
}))
const topReportCategories = computed(() => {
  const rows = stats.value?.reportsByCategory ?? []
  const max = Math.max(...rows.map((r: any) => r.count), 1)
  return rows.slice(0, 5).map((r: any) => ({ ...r, label: REPORT_CATEGORY_LABEL.value[r.category] ?? r.category, pct: Math.round((r.count / max) * 100) }))
})
const roles = computed(() => (stats.value?.roleBreakdown ?? []).filter((r: any) => r.role !== 'user'))
</script>

<template>
  <div>
    <AdminAgentsCard />

    <div v-if="isLoadingStats && !stats" class="stack-y-5">
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3"><div v-for="n in 4" :key="n" class="h-28 rounded-2xl bg-white/5 animate-pulse" /></div>
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3"><div v-for="n in 4" :key="n" class="h-36 rounded-2xl bg-white/5 animate-pulse" /></div>
      <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
    </div>

    <div v-else-if="statsError && !stats" class="flex flex-col items-center gap-3 py-20 text-white/30">
      <p class="text-sm font-semibold">{{ langStore.t.adminLoadFailed }}</p>
      <button @click="fetchStats" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/8 text-white/60 hover:text-white transition-all">{{ langStore.t.adminRetryBtn }}</button>
    </div>

    <template v-else-if="stats">
      <!-- Требует внимания -->
      <div class="flex items-center gap-2 mb-3">
        <span class="w-1.5 h-1.5 rounded-full" :class="allClear ? 'bg-emerald-400' : 'bg-rose-400 animate-pulse'"></span>
        <h2 class="text-xs font-extrabold text-white/50 tracking-[0.15em] uppercase">{{ langStore.t.adminRequiresAttention }}</h2>
        <span v-if="allClear" class="text-[11px] font-bold text-emerald-400">всё разобрано</span>
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3 mb-8">
        <button v-for="a in attention" :key="a.tab + a.label" @click="open(a)"
          class="group relative text-left rounded-2xl p-4 border overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          :style="a.value ? `background:${a.color}12;border-color:${a.color}40` : 'background:rgba(255,255,255,0.025);border-color:rgba(255,255,255,0.08)'">
          <div class="flex items-center justify-between mb-3">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center" :style="`background:${a.color}22`">
              <BIcon :name="a.icon" class="w-[18px] h-[18px]" :style="`color:${a.color}`" />
            </div>
            <BIcon name="ArrowUpRight" class="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors" />
          </div>
          <p class="text-3xl font-black leading-none" :class="a.value ? 'text-white' : 'text-white/35'">{{ formatNum(a.value) }}</p>
          <p class="text-sm font-bold text-white/85 mt-2 truncate">{{ a.label }}</p>
          <p class="text-[11px] text-white/40 mt-0.5 truncate">{{ a.hint }}</p>
        </button>
      </div>

      <!-- Ключевые показатели -->
      <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">Ключевые показатели</h2>
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8" :class="kpis.length === 5 ? 'xl:grid-cols-5' : ''">
        <button v-for="k in kpis" :key="k.label" type="button" @click="open(k.target)"
          class="group relative text-left rounded-2xl p-4 sm:p-5 border border-brand-border bg-brand-card hover:border-white/25 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden min-w-0">
          <div class="flex items-center gap-2.5 mb-3">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" :style="`background:${k.color}22`">
              <BIcon :name="k.icon" class="w-4 h-4" :style="`color:${k.color}`" />
            </div>
            <p class="text-xs font-bold text-white/55 truncate">{{ k.label }}</p>
          </div>
          <p class="text-2xl sm:text-3xl font-black text-white leading-none">{{ k.value }}</p>
          <p class="text-[11px] font-semibold mt-2 leading-snug" :style="`color:${k.color}`">{{ k.sub }}</p>
          <svg v-if="k.spark" viewBox="0 0 100 30" preserveAspectRatio="none" class="w-full h-7 mt-3 opacity-80">
            <polyline :points="k.spark" fill="none" :stroke="k.color" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          </svg>
        </button>
      </div>

      <!-- Динамика -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-6">
        <AdminGrowthChart :title="langStore.t.adminUserGrowthTitle ?? 'Рост пользователей'" subtitle="Всего зарегистрировано, по месяцам" color="#6d83e8"
          :series="chartRows(userSeries)" :state="userGrowthState" @retry="fetchStats" />
        <AdminGrowthChart :title="langStore.t.adminPostGrowthTitle" :subtitle="langStore.t.adminPostGrowthSub" color="#66C770"
          :series="chartRows(postSeries)" :state="postGrowthState" @retry="fetchStats" />
      </div>

      <!-- Активность за неделю + аудитория -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5 mb-6">
        <div class="lg:col-span-2 rounded-2xl border border-brand-border bg-brand-card p-4 sm:p-5 min-w-0">
          <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
            <h3 class="font-extrabold text-white text-sm">{{ langStore.t.adminWeeklyActivityTitle }}</h3>
            <div v-if="weekly" class="flex flex-wrap gap-x-4 gap-y-1">
              <span v-for="s in weekly.series" :key="s.key" class="flex items-center gap-1.5 text-xs text-white/55">
                <span class="w-2 h-2 rounded-sm" :style="`background:${s.color}`" />{{ s.label }}
                <b class="text-white">{{ formatNum(s.total) }}</b>
              </span>
            </div>
          </div>
          <div v-if="weekly" class="flex items-end gap-1.5 sm:gap-3 h-40">
            <div v-for="d in weekly.days" :key="d.day" class="flex-1 h-full flex flex-col justify-end min-w-0 group relative">
              <div class="flex items-end justify-center gap-[2px] sm:gap-1 h-[calc(100%-1.25rem)]">
                <div v-for="v in d.values" :key="v.key" class="flex-1 max-w-3 rounded-t-md transition-opacity group-hover:opacity-100 opacity-90"
                  :style="`height:${Math.max(v.count ? 4 : 1, (v.count / weekly.max) * 100)}%;background:${v.color}`" :title="`${v.label}: ${v.count}`" />
              </div>
              <p class="text-[10px] text-white/35 text-center mt-1.5 capitalize truncate">{{ weekdayShort(d.day) }}</p>
              <div class="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-10 px-2.5 py-1.5 rounded-xl bg-[#0B1030]/95 border border-white/10 shadow-lg whitespace-nowrap pointer-events-none">
                <p v-for="v in d.values" :key="v.key" class="text-[11px] text-white/70 flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full" :style="`background:${v.color}`" />{{ v.label }}: <b class="text-white">{{ v.count }}</b>
                </p>
              </div>
            </div>
          </div>
          <p v-else class="text-xs text-white/25 text-center py-10">{{ langStore.t.adminNoDataLabel }}</p>
        </div>

        <div class="rounded-2xl border border-brand-border bg-brand-card p-4 sm:p-5">
          <h3 class="font-extrabold text-white text-sm mb-4">Аудитория</h3>
          <div class="stack-y-4">
            <div v-for="a in audience" :key="a.label">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-xs font-semibold text-white/60">{{ a.label }}</span>
                <span class="text-xs font-black text-white">{{ a.value }}%</span>
              </div>
              <div class="h-2 rounded-full bg-white/6 overflow-hidden">
                <div class="h-full rounded-full transition-all" :style="`width:${a.value}%;background:${a.color}`" />
              </div>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-brand-border">
            <div v-for="e in engagement" :key="e.label" class="text-center">
              <BIcon :name="e.icon" class="w-4 h-4 mx-auto mb-1" :style="`color:${e.color}`" />
              <p class="text-sm font-black text-white">{{ e.value }}</p>
              <p class="text-[10px] text-white/40 truncate">{{ e.label }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Разделы платформы -->
      <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">Разделы платформы</h2>
      <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <button v-for="sc in sections" :key="sc.label" type="button" @click="open(sc)"
          class="group relative text-left rounded-2xl p-4 border border-brand-border bg-brand-card hover:border-white/25 hover:-translate-y-0.5 transition-all duration-200 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-3">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" :style="`background:${sc.color}22`">
              <BIcon :name="sc.icon" class="w-4 h-4" :style="`color:${sc.color}`" />
            </div>
            <BIcon name="ArrowUpRight" class="w-3.5 h-3.5 text-white/20 group-hover:text-white/60 transition-colors" />
          </div>
          <p class="text-2xl font-black text-white leading-none">{{ sc.value }}</p>
          <p class="text-sm font-bold text-white/80 mt-2 truncate">{{ sc.label }}</p>
          <p class="text-[11px] text-white/40 mt-0.5 leading-snug">{{ sc.sub }}</p>
        </button>
      </div>

      <!-- Жалобы по категориям + команда -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 mb-6">
        <div class="rounded-2xl border border-brand-border bg-brand-card p-4 sm:p-5">
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

        <div class="rounded-2xl border border-brand-border bg-brand-card p-4 sm:p-5">
          <h3 class="font-extrabold text-sm text-white mb-4 flex items-center gap-2">
            <BIcon name="Users" class="w-4 h-4 text-white/40" /> Команда
          </h3>
          <div v-if="roles.length" class="flex flex-wrap gap-2.5">
            <div v-for="rb in roles" :key="rb.role" class="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border border-white/8 bg-white/4">
              <div class="w-2 h-2 rounded-full" :style="`background:${roleColor(rb.role)}`" />
              <span class="text-sm font-black text-white">{{ rb.count }}</span>
              <span class="text-xs text-white/45">{{ roleLabel(rb.role) }}</span>
            </div>
          </div>
          <p v-else class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoDataLabel }}</p>
        </div>
      </div>
    </template>

    <!-- Statistics — merged from the former separate tab, same look -->
    <div id="admin-statistics" class="flex items-center gap-2 mt-10 mb-4 scroll-mt-20">
      <BIcon name="BarChart2" class="w-4 h-4 text-emerald-400" />
      <h2 class="text-xs font-extrabold text-white/50 tracking-[0.15em] uppercase">{{ langStore.t.statsTab }}</h2>
    </div>
    <AdminStatisticsTab />
  </div>
</template>
