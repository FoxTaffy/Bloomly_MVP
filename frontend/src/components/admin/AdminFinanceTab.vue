<script setup lang="ts">
import { ref, computed, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { tierLabel, tierColor, formatNum, formatMonthShort, barMax } from './adminHelpers'
import { useAdminContext } from './adminContext'

const langStore = useLangStore()
const router = useRouter()

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

onActivated(fetchPremiumOverview)
</script>

<template>
  <div>
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
