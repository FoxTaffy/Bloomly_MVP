<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { tierLabel, tierColor, formatNum, formatMonthShort, barMax } from './adminHelpers'
import { useAdminContext } from './adminContext'
import { useFinanceT } from './finance/strings'
import { rub, bc, num, percent, dateTime, PURPOSE_COLOR, TIER_COLOR, SERIES } from './finance/financeFormat'
import RevenueBars from './finance/RevenueBars.vue'
import SubscribersLines from './finance/SubscribersLines.vue'
import BarList, { type BarItem } from './finance/BarList.vue'
import PaymentsList from './finance/PaymentsList.vue'

const langStore = useLangStore()
const router = useRouter()
const ft = useFinanceT()
const { reportAdminError } = useAdminContext()

// ── Финансовый отчёт (платежи, подписки, карты, возвраты, кошелёк BLM) ──────────
const RANGES = [7, 30, 90, 365] as const
const days = ref<number>(30)
const report = ref<any>(null)
const isLoadingReport = ref(false)
const reportError = ref(false)
let loadedAt = 0
let reqSeq = 0
const fetchReport = async () => {
  const seq = ++reqSeq
  isLoadingReport.value = true
  reportError.value = false
  try {
    const res = await api.get('/admin/finance', { params: { days: days.value } })
    if (seq !== reqSeq) return // пришёл ответ на устаревший запрос (период успели сменить)
    if (res.data.success) { report.value = res.data.data; loadedAt = Date.now() } else reportError.value = true
  } catch { if (seq === reqSeq) reportError.value = true }
  finally { if (seq === reqSeq) isLoadingReport.value = false }
}
const setRange = (d: number) => { if (days.value !== d) { days.value = d; fetchReport() } }

const kpi = computed(() => report.value?.kpi)
const fmtDelta = (v: number | null | undefined) => (v == null ? '' : `${v > 0 ? '▲' : v < 0 ? '▼' : '•'} ${Math.abs(v)}% ${ft('vsPrev')}`)
const deltaCls = (v: number | null | undefined) => (v == null || v === 0 ? 'text-white/35' : v > 0 ? 'text-emerald-400' : 'text-rose-400')

const kpiCards = computed(() => {
  const k = kpi.value
  if (!k) return []
  const p = report.value.premium
  return [
    { label: ft('kGross'), value: rub(k.gross), sub: `${k.paidCount} ${ft('payments')}`, delta: k.delta.gross },
    { label: ft('kNet'), value: rub(k.net), sub: `${ft('kCommission')}: ${rub(k.commission)} (${percent(k.commissionRate)})`, delta: k.delta.net },
    { label: ft('kRefunds'), value: rub(k.refunded), sub: `${k.refundedCount} · ${ft('refRate')} ${percent(k.refundRate)}`, delta: null },
    { label: ft('kPayers'), value: num(k.payers), sub: `${ft('kFirst')}: ${k.firstTimePayers}`, delta: k.delta.payers },
    { label: ft('kAvg'), value: rub(k.avgCheck), sub: `${ft('kArppu')}: ${rub(k.arppu)}`, delta: null },
    { label: ft('kMrr'), value: rub(p.mrr), sub: `${ft('arr')}: ${rub(p.arr)}`, delta: null },
    { label: ft('kSubs'), value: num(p.activePaid), sub: `${ft('autoShare')}: ${percent(p.autoRenewShare)}`, delta: null },
    { label: ft('payersAll'), value: num(k.payersAllTime), sub: `${ft('sponsors')}: ${report.value.sponsors}`, delta: null },
  ]
})

const tierItems = computed<BarItem[]>(() =>
  (report.value?.premium.tiers ?? []).filter((t: any) => t.revenue > 0 || t.walletPayments > 0).map((t: any) => ({
    key: t.tier, label: t.tier[0].toUpperCase() + t.tier.slice(1), value: t.revenue, display: rub(t.revenue),
    sub: `${t.payments} ${ft('payments')}`, color: TIER_COLOR[t.tier],
  })))
const methodItems = computed<BarItem[]>(() =>
  (report.value?.methods ?? []).map((m: any) => ({
    key: m.method, label: ft(`mType_${m.method}`) === `mType_${m.method}` ? m.method : ft(`mType_${m.method}`),
    value: m.sum, display: rub(m.sum), sub: `${m.count}`,
  })))
const cardTypeItems = computed<BarItem[]>(() =>
  (report.value?.cards.byType ?? []).map((m: any) => ({
    key: m.type, label: ft(`mType_${m.type}`) === `mType_${m.type}` ? m.type : ft(`mType_${m.type}`), value: m.count, display: String(m.count),
  })))
const ledgerItems = computed<BarItem[]>(() =>
  (report.value?.wallet.ledger ?? []).map((l: any) => ({
    key: l.kind, label: ft(`kind_${l.kind}`), value: Math.abs(l.sum), display: `${l.sum > 0 ? '+' : ''}${bc(l.sum)}`, sub: `${l.count}`,
    color: l.sum >= 0 ? SERIES.c3 : SERIES.c2,
  })))
const renewReasonItems = computed<BarItem[]>(() =>
  (report.value?.autoRenew.failureReasons ?? []).map((r: any) => ({ key: r.reason, label: r.reason.replace(/^canceled: /, ''), value: r.cnt, display: String(r.cnt), color: SERIES.c2 })))

const busyId = ref<string | null>(null)
const resolvePayment = async (id: string, action: 'approve' | 'reject') => {
  if (!window.confirm(ft(action === 'approve' ? 'confirmApprove' : 'confirmReject'))) return
  busyId.value = id
  try {
    await api.post(`/payments/admin/${id}/resolve`, { action })
    await fetchReport()
  } catch (e: any) {
    const code = e?.response?.data?.error?.code
    if (code) window.alert(ft('resolveFailed') + code); else reportAdminError(e)
  } finally { busyId.value = null }
}

// ── Finance & Premium ────────────────────────────────────────────────────
const premiumOverview = ref<any>(null)
const isLoadingPremiumOverview = ref(false)
const fetchPremiumOverview = async () => {
  if (premiumOverview.value) return
  isLoadingPremiumOverview.value = true
  try {
    const res = await api.get('/admin/premium-overview')
    if (res.data.success) premiumOverview.value = res.data.data
  } catch {} finally { isLoadingPremiumOverview.value = false }
}
const paidTierBreakdown = computed(() => {
  const rows = (premiumOverview.value?.byTier ?? []).filter((r: any) => r.tier !== 'free')
  const order: Record<string, number> = { business: 3, pro: 2, lite: 1 }
  return rows.sort((a: any, b: any) => (order[b.tier] ?? 0) - (order[a.tier] ?? 0))
})
const freeUserCount = computed(() => (premiumOverview.value?.byTier ?? []).find((r: any) => r.tier === 'free')?.count ?? 0)
const premiumShare = computed(() => {
  const total = premiumOverview.value?.total ?? 0
  return total ? Math.round(((total - freeUserCount.value) / total) * 100) : 0
})
const gmvMonths = computed(() => premiumOverview.value?.dealersDen?.gmvByMonth ?? [])
const gmvMax = computed(() => Math.max(...gmvMonths.value.map((m: any) => m.total), 1))

onActivated(() => {
  fetchPremiumOverview()
  // Данные денег живут минуту: при возврате на вкладку обновляем, но не дёргаем сервер на каждый клик
  if (!report.value || Date.now() - loadedAt > 60_000) fetchReport()
})
</script>

<template>
  <div>
    <!-- ── Финансы: платежи, подписки, карты, возвраты, кошелёк ─────────────── -->
    <div class="flex items-start justify-between gap-3 flex-wrap mb-5">
      <div>
        <h2 class="text-lg font-black text-white">{{ ft('title') }}</h2>
        <p class="text-xs text-white/40 mt-0.5">{{ ft('subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <div class="flex rounded-xl bg-white/5 p-0.5" role="group">
          <button v-for="r in RANGES" :key="r" type="button" @click="setRange(r)"
            class="px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all"
            :class="days === r ? 'bg-brand-accent text-white' : 'text-white/50 hover:text-white'" :aria-pressed="days === r">
            {{ ft(`days${r}`) }}
          </button>
        </div>
        <button type="button" class="px-3 py-1.5 rounded-xl bg-white/5 text-xs font-bold text-white/60 hover:text-white disabled:opacity-40" :disabled="isLoadingReport" @click="fetchReport">{{ ft('refresh') }}</button>
      </div>
    </div>

    <div v-if="reportError && !report" class="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-200 flex items-center justify-between gap-3 mb-6">
      {{ ft('loadFailed') }}
      <button type="button" class="px-3 py-1.5 rounded-xl bg-white/10 text-xs font-bold text-white" @click="fetchReport">{{ ft('retry') }}</button>
    </div>
    <div v-else-if="!report" class="stack-y-5 mb-6">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4"><div v-for="n in 8" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" /></div>
      <div class="h-64 rounded-2xl bg-white/5 animate-pulse" />
    </div>

    <div v-if="report" class="stack-y-5 mb-10" :class="isLoadingReport ? 'opacity-70 transition-opacity' : 'transition-opacity'">
      <p v-if="reportError" class="text-xs text-rose-300">{{ ft('loadFailed') }}</p>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="c in kpiCards" :key="c.label" class="rounded-2xl p-4 border border-brand-border bg-brand-card min-w-0">
          <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2 break-words">{{ c.label }}</p>
          <p class="text-xl sm:text-2xl font-black text-white tabular-nums break-words">{{ c.value }}</p>
          <p class="text-[11px] font-semibold text-white/45 mt-1 break-words">{{ c.sub }}</p>
          <p v-if="c.delta != null" class="text-[11px] font-bold mt-0.5 break-words" :class="deltaCls(c.delta)">{{ fmtDelta(c.delta) }}</p>
        </div>
      </div>

      <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
        <h3 class="font-extrabold text-white text-sm">{{ ft('revTitle') }}</h3>
        <p class="text-xs text-white/40 mt-0.5 mb-4">{{ ft('revDesc') }}</p>
        <RevenueBars :days="report.daily" :loading="isLoadingReport" />
      </section>

      <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
        <h3 class="font-extrabold text-white text-sm">{{ ft('tierTitle') }}</h3>
        <p class="text-xs text-white/40 mt-0.5 mb-4">{{ ft('tierDesc') }}</p>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarList :items="tierItems" :empty="ft('noData')" />
          <div class="grid grid-cols-2 gap-3">
            <div v-for="t in report.premium.tiers" :key="t.tier" class="rounded-xl bg-white/[0.03] p-3 min-w-0">
              <p class="text-xs font-extrabold mb-2 flex items-center gap-1.5">
                <span class="w-2.5 h-2.5 rounded-[3px]" :style="`background:${TIER_COLOR[t.tier] ?? '#64748b'}`" />
                <span class="text-white capitalize">{{ t.tier }}</span>
              </p>
              <dl class="text-[11px] stack-y-1 text-white/55">
                <div class="flex justify-between gap-x-2 flex-wrap"><dt>{{ ft('tActive') }}</dt><dd class="font-bold text-white tabular-nums whitespace-nowrap">{{ t.active }}</dd></div>
                <div class="flex justify-between gap-x-2 flex-wrap"><dt>{{ ft('tMrr') }}</dt><dd class="font-bold text-white tabular-nums whitespace-nowrap">{{ rub(t.mrr) }}</dd></div>
                <div class="flex justify-between gap-x-2 flex-wrap"><dt>{{ ft('tAutoOn') }}</dt><dd class="font-bold text-white tabular-nums whitespace-nowrap">{{ t.autoRenew }}</dd></div>
                <div class="flex justify-between gap-x-2 flex-wrap"><dt>{{ ft('tNew') }}</dt><dd class="font-bold text-white tabular-nums whitespace-nowrap">{{ t.newSubscribers }}</dd></div>
                <div class="flex justify-between gap-x-2 flex-wrap"><dt>{{ ft('tRenewals') }} / {{ ft('tManual') }}</dt><dd class="font-bold text-white tabular-nums whitespace-nowrap">{{ t.renewals }} / {{ t.manual }}</dd></div>
                <div class="flex justify-between gap-x-2 flex-wrap"><dt>{{ ft('tMonth') }} / {{ ft('tYear') }}</dt><dd class="font-bold text-white tabular-nums whitespace-nowrap">{{ t.month }} / {{ t.year }}</dd></div>
                <div class="flex justify-between gap-x-2 flex-wrap"><dt>{{ ft('tWallet') }}</dt><dd class="font-bold text-white tabular-nums whitespace-nowrap">{{ t.walletPayments }}</dd></div>
                <div v-if="t.refunded" class="flex justify-between gap-2"><dt>{{ ft('tRefunded') }}</dt><dd class="font-bold text-rose-300 tabular-nums whitespace-nowrap">{{ rub(t.refunded) }}</dd></div>
                <div v-if="t.granted" class="flex justify-between gap-2"><dt>{{ ft('tGranted') }}</dt><dd class="font-bold text-white tabular-nums whitespace-nowrap">{{ t.granted }}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
        <h3 class="font-extrabold text-white text-sm">{{ ft('subsTitle') }}</h3>
        <p class="text-xs text-white/40 mt-0.5 mb-4">{{ ft('subsDesc') }}</p>
        <SubscribersLines :days="report.subscribers" :loading="isLoadingReport" />
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <div class="rounded-xl bg-white/[0.03] p-3">
            <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('next7') }}</p>
            <p class="text-lg font-black text-white tabular-nums">{{ rub(report.premium.expectedRenewals7d) }}</p>
            <p class="text-[11px] text-white/45">{{ report.premium.expectedRenewals7dCount }} {{ ft('people') }}</p>
          </div>
          <div class="rounded-xl bg-white/[0.03] p-3">
            <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('churn7') }}</p>
            <p class="text-lg font-black tabular-nums" :class="report.premium.churnRisk7d ? 'text-amber-300' : 'text-white'">{{ report.premium.churnRisk7d }}</p>
            <p class="text-[11px] text-white/45">{{ ft('people') }}</p>
          </div>
          <div class="rounded-xl bg-white/[0.03] p-3">
            <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('autoShare') }}</p>
            <p class="text-lg font-black text-white tabular-nums">{{ percent(report.premium.autoRenewShare) }}</p>
            <p class="text-[11px] text-white/45">{{ report.premium.autoRenewActive }} / {{ report.premium.activePaid }}</p>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm">{{ ft('funnelTitle') }}</h3>
          <p class="text-xs text-white/40 mt-0.5 mb-4">{{ ft('funnelDesc') }}</p>
          <ul class="stack-y-4">
            <li v-for="f in report.funnel" :key="f.purpose">
              <div class="flex items-baseline justify-between gap-3 mb-1">
                <span class="text-xs font-semibold text-white/80">{{ f.purpose === 'card_binding' ? ft('purBinding') : ft(`pur_${f.purpose}`) }}</span>
                <span class="text-xs text-white/50 tabular-nums">
                  {{ f.created }} {{ ft('fCreated') }} → <b class="text-white">{{ f.paid }}</b> {{ ft('fPaid') }}
                  <b class="text-white">{{ percent(f.conversion) }}</b>
                </span>
              </div>
              <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div class="h-full rounded-full" :style="`width:${f.created ? (f.paid / f.created) * 100 : 0}%;background:${SERIES.c3}`" />
              </div>
              <p class="text-[11px] text-white/35 mt-1">{{ ft('fAbandoned') }}: {{ f.expired }} · {{ ft('fPending') }}: {{ f.pending }}<template v-if="f.review"> · {{ ft('st_review') }}: {{ f.review }}</template></p>
            </li>
          </ul>
        </section>

        <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm">{{ ft('renewTitle') }}</h3>
          <p class="text-xs text-white/40 mt-0.5 mb-4">{{ ft('renewDesc') }}</p>
          <p v-if="!report.autoRenew.ok && !report.autoRenew.failed && !report.autoRenew.pending" class="text-xs text-white/25 text-center py-6">{{ ft('rNone') }}</p>
          <template v-else>
            <div class="grid grid-cols-2 gap-3 mb-4">
              <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('rOk') }}</p><p class="text-lg font-black text-white tabular-nums">{{ report.autoRenew.ok }} <span class="text-xs font-semibold text-white/40">{{ rub(report.autoRenew.okSum) }}</span></p></div>
              <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('rFail') }}</p><p class="text-lg font-black tabular-nums" :class="report.autoRenew.failed ? 'text-amber-300' : 'text-white'">{{ report.autoRenew.failed }} <span class="text-xs font-semibold text-white/40">{{ rub(report.autoRenew.failedSum) }}</span></p></div>
              <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('rRate') }}</p><p class="text-lg font-black text-white tabular-nums">{{ percent(report.autoRenew.successRate) }}</p></div>
              <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('rPending') }}</p><p class="text-lg font-black text-white tabular-nums">{{ report.autoRenew.pending }}</p></div>
            </div>
            <template v-if="renewReasonItems.length">
              <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ ft('rReasons') }}</p>
              <BarList :items="renewReasonItems" />
            </template>
          </template>
        </section>
      </div>

      <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
        <h3 class="font-extrabold text-white text-sm">{{ ft('cardsTitle') }}</h3>
        <p class="text-xs text-white/40 mt-0.5 mb-4">{{ ft('cardsDesc') }}</p>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('cSaved') }}</p><p class="text-lg font-black text-white tabular-nums">{{ report.cards.saved }}</p></div>
          <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('cUsers') }}</p><p class="text-lg font-black text-white tabular-nums">{{ report.cards.users }}</p></div>
          <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('cNew') }}</p><p class="text-lg font-black text-white tabular-nums">{{ report.cards.newInPeriod }}</p></div>
          <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('cBindings') }}</p><p class="text-lg font-black text-white tabular-nums">{{ report.cards.bindingsStarted }} / {{ report.cards.bindingsDone }}</p></div>
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarList :items="cardTypeItems" :empty="ft('noData')" :color="SERIES.c1" />
          <div>
            <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ ft('cRecent') }}</p>
            <p v-if="!report.cards.recent.length" class="text-xs text-white/25 py-4">{{ ft('noData') }}</p>
            <ul v-else class="divide-y divide-white/[0.05]">
              <li v-for="m in report.cards.recent" :key="m.id" class="py-2 flex items-center gap-2.5 text-xs">
                <router-link :to="`/profile/${m.user.username}`" target="_blank" class="font-semibold text-white hover:underline truncate">@{{ m.user.username }}</router-link>
                <span class="text-white/45 truncate">{{ m.title || ft(`mType_${m.type}`) }}<template v-if="m.last4"> ·· {{ m.last4 }}</template></span>
                <span class="ml-auto text-white/35 shrink-0">{{ dateTime(m.created_at) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm">{{ ft('methodsTitle') }}</h3>
          <p class="text-xs text-white/40 mt-0.5 mb-4">{{ ft('methodsDesc') }}</p>
          <BarList :items="methodItems" :empty="ft('noData')" :color="SERIES.c1" />
        </section>
        <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm">{{ ft('walletTitle') }}</h3>
          <p class="text-xs text-white/40 mt-0.5 mb-4">{{ ft('walletDesc') }}</p>
          <div class="grid grid-cols-2 gap-3 mb-4">
            <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('wTotal') }}</p><p class="text-lg font-black text-white tabular-nums">{{ bc(report.wallet.balanceTotal) }}</p><p class="text-[11px] text-white/45">≈ {{ rub(report.wallet.balanceTotal * report.wallet.bcRate) }}</p></div>
            <div class="rounded-xl bg-white/[0.03] p-3"><p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-1">{{ ft('wHolders') }}</p><p class="text-lg font-black text-white tabular-nums">{{ report.wallet.holders }}</p></div>
          </div>
          <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ ft('wMovement') }}</p>
          <BarList :items="ledgerItems" :empty="ft('wNone')" />
        </section>
      </div>

      <section class="rounded-2xl border bg-brand-card p-5" :class="report.review.length ? 'border-amber-500/40' : 'border-brand-border'">
        <h3 class="font-extrabold text-white text-sm">{{ ft('reviewTitle') }} <span v-if="report.review.length" class="ml-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">{{ report.review.length }}</span></h3>
        <p class="text-xs text-white/40 mt-0.5 mb-2">{{ ft('reviewDesc') }}</p>
        <PaymentsList :rows="report.review" :empty="ft('reviewNone')" :busy-id="busyId" @approve="resolvePayment($event, 'approve')" @reject="resolvePayment($event, 'reject')" />
      </section>

      <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
        <h3 class="font-extrabold text-white text-sm">{{ ft('recentTitle') }}</h3>
        <p class="text-xs text-white/40 mt-0.5 mb-2">{{ ft('recentDesc') }}</p>
        <PaymentsList :rows="report.recent" :empty="ft('recentNone')" />
      </section>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm">{{ ft('refundsTitle') }}</h3>
          <p class="text-xs text-white/40 mt-0.5 mb-2">{{ ft('refundsDesc') }}</p>
          <p v-if="report.refunds.partial" class="text-xs font-semibold text-amber-300 mb-2">{{ ft('refPartial') }}: {{ report.refunds.partial }}</p>
          <PaymentsList :rows="report.refunds.list" :empty="ft('refNone')" />
        </section>
        <section class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm">{{ ft('payersTitle') }}</h3>
          <p class="text-xs text-white/40 mt-0.5 mb-3">{{ ft('payersDesc') }}</p>
          <p v-if="!report.topPayers.length" class="text-xs text-white/25 text-center py-6">{{ ft('noData') }}</p>
          <ol v-else class="divide-y divide-white/[0.05]">
            <li v-for="(p, i) in report.topPayers" :key="p.user.id" class="py-2 flex items-center gap-2.5 text-xs">
              <span class="w-5 text-white/30 font-bold tabular-nums">{{ i + 1 }}</span>
              <router-link :to="`/profile/${p.user.username}`" target="_blank" class="font-semibold text-white hover:underline truncate">{{ p.user.display_name || p.user.username }}</router-link>
              <span v-if="tierLabel(p.user.subscription_tier)" class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0" :style="`background:${tierColor(p.user.subscription_tier)}20;color:${tierColor(p.user.subscription_tier)}`">{{ tierLabel(p.user.subscription_tier) }}</span>
              <span class="ml-auto font-black text-white tabular-nums shrink-0">{{ rub(p.total) }}</span>
              <span class="text-white/35 shrink-0 w-10 text-right">×{{ p.count }}</span>
            </li>
          </ol>
          <div v-if="report.wallet.topHolders.length" class="mt-5">
            <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ ft('wTop') }}</p>
            <ul class="stack-y-1.5">
              <li v-for="h in report.wallet.topHolders" :key="h.user.id" class="flex items-center gap-2 text-xs">
                <router-link :to="`/profile/${h.user.username}`" target="_blank" class="text-white/80 hover:underline truncate">@{{ h.user.username }}</router-link>
                <span class="ml-auto font-bold text-white tabular-nums">{{ bc(h.balance) }}</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>

    <h2 class="text-lg font-black text-white mb-4">{{ ft('otherTitle') }}</h2>
    <div v-if="isLoadingPremiumOverview" class="stack-y-5">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="n in 4" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
      </div>
      <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
    </div>
    <template v-else-if="premiumOverview">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
          <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminStatWithSub }}</p>
          <p class="text-2xl font-black text-white">{{ formatNum(premiumOverview.total - freeUserCount) }}</p>
          <p class="text-xs font-semibold text-brand-accent mt-1">{{ langStore.t.adminSubOutOf }} {{ formatNum(premiumOverview.total) }} {{ langStore.t.adminSubUsersGenitive }}</p>
        </div>
        <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
          <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminPremiumShareLabel }}</p>
          <p class="text-2xl font-black text-white">{{ premiumShare }}%</p>
          <p class="text-xs font-semibold text-emerald-400 mt-1">{{ langStore.t.adminOfAllUsersLabel }}</p>
        </div>
        <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
          <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminTopTierLabel }}</p>
          <p class="text-2xl font-black text-white">{{ tierLabel(paidTierBreakdown[0]?.tier) ?? '—' }}</p>
          <p class="text-xs font-semibold text-amber-400 mt-1">{{ formatNum(paidTierBreakdown[0]?.count ?? 0) }} {{ langStore.t.adminSubscribersSuffix }}</p>
        </div>
        <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
          <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminNoSubscription }}</p>
          <p class="text-2xl font-black text-white">{{ formatNum(freeUserCount) }}</p>
          <p class="text-xs font-semibold text-white/40 mt-1">{{ langStore.t.adminFreeTierLabel }}</p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminTierBreakdownTitle }}</h3>
          <div v-for="t in paidTierBreakdown" :key="t.tier" class="mb-3 last:mb-0">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-semibold" :style="`color:${tierColor(t.tier)}`">{{ tierLabel(t.tier) }}</span>
              <span class="text-xs font-bold text-white">{{ formatNum(t.count) }} {{ langStore.t.adminSubscribersSuffix }}</span>
            </div>
            <div class="h-1.5 rounded-full bg-white/6 overflow-hidden">
              <div class="h-full rounded-full" :style="`width:${Math.round((t.count / barMax(paidTierBreakdown.map((x:any)=>({value:x.count})))) * 100)}%;background:${tierColor(t.tier)}`" />
            </div>
          </div>
          <p v-if="!paidTierBreakdown.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoPaidSubscribersYet }}</p>
        </div>

        <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
          <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminPremiumSubscribersTitle }}</h3>
          <div v-if="!premiumOverview.topSubscribers.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoOneSubscribedYet }}</div>
          <router-link v-for="u in premiumOverview.topSubscribers" :key="u.id" :to="`/profile/${u.username}`" target="_blank"
            class="flex items-center gap-2.5 py-2 hover:bg-white/3 rounded-xl transition-all -mx-2 px-2">
            <img v-if="u.avatar_url" :src="u.avatar_url" class="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" />
            <div v-else class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              :style="`background:${tierColor(u.subscription_tier)}20;color:${tierColor(u.subscription_tier)}`">
              {{ (u.display_name || u.username || '?')[0].toUpperCase() }}
            </div>
            <span class="text-sm font-semibold text-white truncate flex-1">{{ u.display_name || u.username }}</span>
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full shrink-0"
              :style="`background:${tierColor(u.subscription_tier)}20;color:${tierColor(u.subscription_tier)}`">
              {{ tierLabel(u.subscription_tier) }}
            </span>
          </router-link>
        </div>
      </div>

      <!-- Dealers' Den turnover — honestly labelled: the marketplace takes
           no commission today, so this is buyer↔seller turnover (GMV),
           not platform income. -->
      <div class="rounded-2xl border border-brand-border bg-brand-card p-5 mt-5">
        <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
          <div>
            <h3 class="font-extrabold text-white text-sm">{{ langStore.t.adminDealersDenTurnoverTitle }}</h3>
            <p class="text-xs text-white/40 mt-0.5">{{ langStore.t.adminDealersDenTurnoverDesc }}</p>
          </div>
          <span class="text-xs font-bold px-3 py-1.5 rounded-full bg-brand-accent/15 text-brand-accent shrink-0">
            ${{ formatNum(premiumOverview.dealersDen.totalGmv) }} {{ langStore.t.adminTotalLowercase }} · {{ premiumOverview.dealersDen.soldCount }} {{ langStore.t.adminSalesSuffix }}
          </span>
        </div>
        <div v-if="gmvMonths.length" class="flex items-end gap-1.5 h-28 mt-4">
          <div v-for="(m, idx) in gmvMonths" :key="idx"
            class="flex-1 flex flex-col items-center gap-1 group/bar cursor-default relative">
            <div class="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100
              text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-none">
              ${{ m.total }} · {{ m.count }} {{ langStore.t.adminUnitsShortSuffix }}
            </div>
            <div class="w-full rounded-t-lg transition-all hover:opacity-100 opacity-80 bg-brand-accent"
              :style="`height:${Math.max(4, (m.total / gmvMax) * 100)}px`" />
          </div>
        </div>
        <div v-if="gmvMonths.length" class="flex justify-between mt-2 px-0.5">
          <span class="text-[10px] text-white/30">{{ formatMonthShort(gmvMonths[0].month) }}</span>
          <span class="text-[10px] text-white/30">{{ formatMonthShort(gmvMonths[gmvMonths.length-1].month) }}</span>
        </div>
        <p v-else class="text-xs text-white/25 text-center py-8">{{ langStore.t.adminNoSalesYet }}</p>
      </div>
    </template>
  </div>
</template>
