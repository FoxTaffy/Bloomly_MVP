<script setup lang="ts">
import { ref, computed, watchEffect, onActivated } from 'vue'
import api from '@/api'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from '@/components/BIcon.vue'
import { formatNum, formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'
import { useMarketT } from './market/strings'

const gt = useMarketT()
const { confirmDialog } = useConfirm()
const { badges, reportAdminError } = useAdminContext()

type View = 'overview' | 'listings' | 'disputes' | 'fairs' | 'frames' | 'groups'
const view = ref<View>('overview')
const fmtMoney = (n: number, cur: string) => `${Number(n).toLocaleString('ru-RU')} ${({ USD: '$', RUB: '₽', EUR: '€' } as Record<string, string>)[cur] ?? cur}`
const initial = (n?: string | null) => (n || '?')[0].toUpperCase()

// ── Overview ────────────────────────────────────────────────────────────
const overview = ref<any>(null)
const overviewFailed = ref(false)
const fetchOverview = async () => {
  overviewFailed.value = false
  try {
    const res = await api.get('/admin/den/overview')
    if (res.data.success) overview.value = res.data.data
    else overviewFailed.value = true
  } catch { overviewFailed.value = true }
}
const tiles = computed(() => {
  const s = overview.value?.stats
  if (!s) return []
  return [
    { label: gt('kListings'), value: s.listings, sub: `+${s.newWeek} ${gt('thisWeek')}`, foot: `${s.draft} ${gt('draftsN')} · ${s.archived} ${gt('archivedN')}`, color: '#4C67CF', bg: 'rgba(76,103,207,0.09)' },
    { label: gt('kActive'), value: s.active, foot: `${s.sold} ${gt('soldN')}`, color: '#10b981', bg: 'rgba(16,185,129,0.07)' },
    { label: gt('kViews'), value: s.views, foot: `${s.unitsSold} ${gt('kSold').toLowerCase()}`, color: '#a78bfa', bg: 'rgba(167,139,250,0.07)' },
    { label: gt('kBids'), value: s.bids, foot: `${s.reviews} ${gt('kReviews').toLowerCase()}`, color: '#38bdf8', bg: 'rgba(56,189,248,0.07)' },
    { label: gt('kDisputes'), value: s.disputesOpen, foot: `${s.disputesTotal} ${gt('denDisputes').toLowerCase()}`, color: '#f43f5e', bg: 'rgba(244,63,94,0.07)' },
    { label: gt('kApplications'), value: s.fairApplications, foot: `${s.fairs} ${gt('denFairs').toLowerCase()}`, color: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
    { label: gt('kFramesPending'), value: s.framesPending, color: '#c084fc', bg: 'rgba(192,132,252,0.07)' },
    { label: gt('kSellerGroups'), value: s.groups, color: '#2dd4bf', bg: 'rgba(45,212,191,0.07)' },
  ]
})

// ── Listings ────────────────────────────────────────────────────────────
const listings = ref<any>(null)
const listingsLoading = ref(false)
const listingsFailed = ref(false)
const lSearch = ref('')
const lStatus = ref('')
const lKind = ref('')
const lPage = ref(1)
let lDebounce: ReturnType<typeof setTimeout>
const fetchListings = async () => {
  listingsLoading.value = true
  listingsFailed.value = false
  try {
    const res = await api.get('/admin/den/listings', { params: { search: lSearch.value || undefined, status: lStatus.value || undefined, kind: lKind.value || undefined, page: lPage.value } })
    if (res.data.success) listings.value = res.data.data
    else listingsFailed.value = true
  } catch { listingsFailed.value = true } finally { listingsLoading.value = false }
}
const onLSearch = () => { clearTimeout(lDebounce); lDebounce = setTimeout(() => { lPage.value = 1; fetchListings() }, 300) }
const setL = (kind: 'status' | 'kind', v: string) => { (kind === 'status' ? lStatus : lKind).value = v; lPage.value = 1; fetchListings() }
const setListingStatus = async (l: any, status: string) => {
  if (status === 'archived' && !(await confirmDialog(gt('confirmArchiveListing'), { danger: true }))) return
  try { await api.patch(`/admin/den/listings/${l.id}/status`, { status }); l.status = status; fetchOverview() } catch (e) { reportAdminError(e) }
}
const deleteListing = async (l: any) => {
  if (!(await confirmDialog(gt('confirmDeleteListing'), { danger: true }))) return
  try { await api.delete(`/admin/den/listings/${l.id}`); await Promise.all([fetchListings(), fetchOverview()]) } catch (e) { reportAdminError(e) }
}
const listingStatusClass = (s: string) => s === 'active' ? 'bg-emerald-500/15 text-emerald-400' : s === 'sold' ? 'bg-sky-500/15 text-sky-400' : s === 'archived' ? 'bg-rose-500/15 text-rose-400' : 'bg-white/8 text-white/50'

// ── Disputes ────────────────────────────────────────────────────────────
const disputes = ref<any[] | null>(null)
const disputesFailed = ref(false)
const dFilter = ref<'open' | 'resolved'>('open')
const resolvingId = ref<string | null>(null)
const fetchDisputes = async () => {
  disputesFailed.value = false
  try {
    const res = await api.get('/admin/den/disputes', { params: { status: dFilter.value } })
    if (res.data.success) disputes.value = res.data.data.disputes
    else disputesFailed.value = true
  } catch { disputesFailed.value = true }
}
const resolveDispute = async (d: any, winner: 'buyer' | 'seller') => {
  if (resolvingId.value) return
  const resolution = window.prompt(gt('resolutionPrompt'))
  if (resolution === null) return
  resolvingId.value = d.id
  try {
    await api.patch(`/admin/den-disputes/${d.id}/resolve`, { winner, resolution: resolution.trim() || (winner === 'buyer' ? gt('winBuyer') : gt('winSeller')) })
    await Promise.all([fetchDisputes(), fetchOverview()])
  } catch (e) { reportAdminError(e) } finally { resolvingId.value = null }
}

// ── Fairs ───────────────────────────────────────────────────────────────
const fairs = ref<any[] | null>(null)
const fairsFailed = ref(false)
const fetchFairs = async () => {
  fairsFailed.value = false
  try {
    const res = await api.get('/admin/den/fairs')
    if (res.data.success) fairs.value = res.data.data.fairs
    else fairsFailed.value = true
  } catch { fairsFailed.value = true }
}
const decideParticipant = async (fair: any, p: any, status: 'approved' | 'rejected') => {
  try { await api.patch(`/admin/den-fairs/${fair.id}/participants/${p.user_id}`, { status }); p.status = status; fetchOverview() } catch (e) { reportAdminError(e) }
}
const setFairStatus = async (f: any, status: string) => {
  try { await api.patch(`/admin/den/fairs/${f.id}/status`, { status }); f.status = status } catch (e) { reportAdminError(e) }
}
const fairForm = ref<{ title: string; description: string; theme: string; bannerUrl: string; startsAt: string; endsAt: string } | null>(null)
const savingFair = ref(false)
const openFairForm = () => { fairForm.value = { title: '', description: '', theme: '', bannerUrl: '', startsAt: '', endsAt: '' } }
const saveFair = async () => {
  const f = fairForm.value
  if (!f || savingFair.value || !f.title.trim() || !f.startsAt || !f.endsAt) return
  savingFair.value = true
  try {
    await api.post('/admin/den-fairs', {
      title: f.title.trim(), description: f.description || undefined, theme: f.theme || undefined, bannerUrl: f.bannerUrl || undefined,
      startsAt: new Date(f.startsAt).toISOString(), endsAt: new Date(f.endsAt).toISOString(),
    })
    fairForm.value = null
    await Promise.all([fetchFairs(), fetchOverview()])
  } catch (e) { reportAdminError(e) } finally { savingFair.value = false }
}
const participantClass = (s: string) => s === 'approved' ? 'bg-emerald-500/15 text-emerald-400' : s === 'rejected' ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'

// ── Frame submissions ───────────────────────────────────────────────────
const frames = ref<any[] | null>(null)
const framesFailed = ref(false)
const frameFilter = ref<'pending' | 'approved' | 'rejected'>('pending')
const framesBusy = ref<Record<string, boolean>>({})
const fetchFrames = async () => {
  framesFailed.value = false
  try {
    const res = await api.get('/admin/avatar-frames', { params: { status: frameFilter.value } })
    if (res.data.success) frames.value = res.data.data.submissions
    else framesFailed.value = true
  } catch { framesFailed.value = true }
}
const reviewFrame = async (f: any, action: 'approve' | 'reject') => {
  if (framesBusy.value[f.id]) return
  let reason: string | undefined
  if (action === 'reject') {
    const r = window.prompt(gt('rejectReason'))
    if (r === null) return
    reason = r || undefined
  }
  framesBusy.value[f.id] = true
  try {
    await api.patch(`/admin/avatar-frames/${f.id}`, { action, reason })
    frames.value = (frames.value ?? []).filter(x => x.id !== f.id)
    fetchOverview()
  } catch (e) { reportAdminError(e) } finally { delete framesBusy.value[f.id] }
}

// ── Seller groups ───────────────────────────────────────────────────────
const denGroups = ref<any[] | null>(null)
const denGroupsFailed = ref(false)
const fetchDenGroups = async () => {
  denGroupsFailed.value = false
  try {
    const res = await api.get('/admin/den/groups')
    if (res.data.success) denGroups.value = res.data.data.groups
    else denGroupsFailed.value = true
  } catch { denGroupsFailed.value = true }
}
const disconnectGroup = async (g: any) => {
  if (!(await confirmDialog(gt('confirmDisconnect'), { danger: true }))) return
  try { await api.post(`/admin/den/groups/${g.id}/disconnect`); denGroups.value = (denGroups.value ?? []).filter(x => x.id !== g.id); fetchOverview() } catch (e) { reportAdminError(e) }
}

const switchView = (v: View) => {
  view.value = v
  if (v === 'listings' && !listings.value) fetchListings()
  if (v === 'disputes' && !disputes.value) fetchDisputes()
  if (v === 'fairs' && !fairs.value) fetchFairs()
  if (v === 'frames' && !frames.value) fetchFrames()
  if (v === 'groups' && !denGroups.value) fetchDenGroups()
}
const VIEW_ICON: Record<View, string> = { overview: 'LayoutDashboard', listings: 'Store', disputes: 'Gavel', fairs: 'CalendarDays', frames: 'Frame', groups: 'Users' }
const VIEW_KEY: Record<View, string> = { overview: 'denOverview', listings: 'denListings', disputes: 'denDisputes', fairs: 'denFairs', frames: 'denFrames', groups: 'denGroups' }
const viewBadge = (v: View) => {
  const s = overview.value?.stats
  if (!s) return 0
  return v === 'disputes' ? s.disputesOpen : v === 'fairs' ? s.fairApplications : v === 'frames' ? s.framesPending : 0
}

onActivated(() => { if (!overview.value) fetchOverview() })
watchEffect(() => {
  const s = overview.value?.stats
  badges.den = s ? s.disputesOpen + s.fairApplications + s.framesPending : 0
})
</script>

<template>
  <div>
    <div class="flex items-center gap-2 mb-5 p-1 rounded-2xl bg-white/4 w-fit flex-wrap">
      <button v-for="v in (['overview', 'listings', 'disputes', 'fairs', 'frames', 'groups'] as const)" :key="v" type="button" @click="switchView(v)"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        :class="view === v ? 'bg-brand-accent/20 text-brand-accent' : 'text-white/40 hover:text-white/70'">
        <BIcon :name="VIEW_ICON[v]" class="w-3.5 h-3.5" /> {{ gt(VIEW_KEY[v]) }}
        <span v-if="viewBadge(v)" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-400/20 text-rose-300">{{ viewBadge(v) }}</span>
      </button>
    </div>

    <!-- ═════ Overview ═════ -->
    <template v-if="view === 'overview'">
      <div v-if="overviewFailed" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchOverview" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!overview" class="grid grid-cols-2 lg:grid-cols-4 gap-3"><div v-for="n in 8" :key="n" class="h-28 rounded-2xl bg-white/5 animate-pulse" /></div>
      <template v-else>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
          <div v-for="t in tiles" :key="t.label" class="rounded-2xl px-4 py-3" :style="`background:${t.bg}`">
            <p class="text-[10px] font-bold uppercase tracking-wide truncate" :style="`color:${t.color}b3`">{{ t.label }}</p>
            <p class="text-2xl font-black mt-0.5" :style="`color:${t.color}`">{{ formatNum(t.value) }}</p>
            <p v-if="t.sub" class="text-[11px] font-bold text-white/55 mt-0.5">{{ t.sub }}</p>
            <p v-if="t.foot" class="text-[10px] text-white/30 mt-1 truncate">{{ t.foot }}</p>
          </div>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
            <h3 class="font-extrabold text-white text-sm mb-3">{{ gt('byKind') }}</h3>
            <p v-if="!overview.byKind.length" class="text-xs text-white/25 py-3 text-center">{{ gt('empty') }}</p>
            <div v-for="k in overview.byKind" :key="k.kind" class="flex items-center justify-between py-1.5 text-sm"><span class="text-white/65">{{ gt('k_' + k.kind) }}</span><span class="font-bold text-white">{{ k.count }}</span></div>
            <h3 class="font-extrabold text-white text-sm mt-5 mb-3">{{ gt('byCategory') }}</h3>
            <div v-for="c in overview.byCategory" :key="c.category" class="flex items-center justify-between py-1 text-sm"><span class="text-white/65 capitalize">{{ c.category }}</span><span class="font-bold text-white">{{ c.count }}</span></div>
          </div>
          <div class="rounded-2xl border border-brand-border bg-brand-card p-5 xl:col-span-2">
            <h3 class="font-extrabold text-white text-sm mb-3">{{ gt('topSellers') }}</h3>
            <div class="flex flex-wrap gap-1.5 mb-3">
              <span v-for="t in overview.trustTiers" :key="t.tier" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/8 text-white/55">{{ t.tier }} · {{ t.count }}</span>
            </div>
            <p v-if="!overview.topSellers.length" class="text-xs text-white/25 py-3 text-center">{{ gt('empty') }}</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div v-for="s in overview.topSellers" :key="s.user.id" class="rounded-xl bg-white/4 p-3 flex items-center gap-3">
                <img v-if="s.user.avatar_url" :src="s.user.avatar_url" alt="" loading="lazy" class="w-10 h-10 rounded-full object-cover shrink-0" />
                <div v-else class="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center text-sm font-bold text-white/40 shrink-0">{{ initial(s.user.display_name || s.user.username) }}</div>
                <div class="min-w-0 flex-1">
                  <router-link :to="`/dealers-den/seller/${s.user.username}`" target="_blank" class="text-sm font-bold text-white hover:text-brand-accent truncate block">{{ s.user.display_name || s.user.username }}</router-link>
                  <p class="text-[11px] text-white/40">{{ s.tier }} · {{ s.completed_deals }}/{{ s.total_deals }} {{ gt('deals') }} · ★ {{ s.avg_rating }}</p>
                  <p v-if="s.disputes_lost" class="text-[11px] text-rose-400">{{ s.disputes_lost }} {{ gt('lost') }}</p>
                </div>
                <span class="text-sm font-black text-brand-accent shrink-0">{{ s.score }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ═════ Listings ═════ -->
    <template v-else-if="view === 'listings'">
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="relative flex-1 max-w-sm min-w-[200px]">
          <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input v-model="lSearch" @input="onLSearch" type="text" :placeholder="gt('search')"
            class="w-full bg-white/6 border border-transparent rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25 outline-hidden focus:border-brand-accent/40 transition-all" />
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mb-5">
        <button v-for="s in ['', 'active', 'sold', 'draft', 'archived']" :key="s" type="button" @click="setL('status', s)"
          class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
          :class="lStatus === s ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent' : 'bg-brand-card border-brand-border text-white/45 hover:text-white/75'">{{ s ? gt('ls_' + s) : gt('all') }}</button>
        <span class="w-px bg-white/10 mx-1" />
        <button v-for="k in ['', 'fixed', 'auction', 'ych', 'raffle', 'commission_queue']" :key="k" type="button" @click="setL('kind', k)"
          class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
          :class="lKind === k ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent' : 'bg-brand-card border-brand-border text-white/45 hover:text-white/75'">{{ k ? gt('k_' + k) : gt('all') }}</button>
      </div>
      <div v-if="listingsFailed && !listings" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchListings" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!listings" class="grid grid-cols-1 xl:grid-cols-2 gap-4"><div v-for="n in 4" :key="n" class="h-40 rounded-2xl bg-white/5 animate-pulse" /></div>
      <div v-else-if="!listings.listings.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
        <BIcon name="Store" class="w-10 h-10 opacity-40" /><p class="text-sm font-semibold">{{ gt('empty') }}</p>
      </div>
      <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4" :class="{ 'opacity-60 pointer-events-none': listingsLoading }">
        <article v-for="l in listings.listings" :key="l.id" class="rounded-2xl border border-brand-border bg-brand-card p-4 flex gap-4">
          <img v-if="l.image" :src="l.image" alt="" loading="lazy" class="w-28 h-28 rounded-xl object-cover shrink-0 bg-black/20" :class="{ 'blur-sm hover:blur-none transition': l.isNsfw }" />
          <div v-else class="w-28 h-28 rounded-xl bg-white/5 flex items-center justify-center shrink-0"><BIcon name="ImageOff" class="w-6 h-6 text-white/25" /></div>
          <div class="min-w-0 flex-1 flex flex-col gap-1.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full" :class="listingStatusClass(l.status)">{{ gt('ls_' + l.status) }}</span>
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/8 text-white/55">{{ gt('k_' + l.kind) }}</span>
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/8 text-white/40">{{ l.category }}</span>
              <span v-if="l.isNsfw" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">NSFW</span>
              <span v-if="l.disputes" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">{{ l.disputes }} {{ gt('disputesN') }}</span>
            </div>
            <router-link :to="`/dealers-den/${l.id}`" target="_blank" class="font-extrabold text-white truncate hover:text-brand-accent">{{ l.title }}</router-link>
            <p class="text-sm font-black text-amber-400">{{ fmtMoney(l.currentBid ?? l.price, l.currency) }}</p>
            <p class="text-xs text-white/45 truncate">{{ gt('seller') }}: <router-link :to="`/profile/${l.seller.username}`" target="_blank" class="font-bold text-white/65 hover:text-brand-accent">@{{ l.seller.username }}</router-link><template v-if="l.group"> · {{ l.group.name }}</template></p>
            <p class="text-[11px] text-white/35">{{ formatNum(l.views) }} {{ gt('views') }} · {{ l.bids }} {{ gt('bids') }}<template v-if="l.tickets"> · {{ l.tickets }} {{ gt('tickets') }}</template> · {{ l.sold }}/{{ l.quantity }} {{ gt('soldUnits') }} · {{ l.reviews }} {{ gt('reviewsN') }} · {{ formatDate(l.createdAt) }}</p>
            <div class="mt-auto flex items-center gap-2 pt-1">
              <button v-if="l.status !== 'archived'" type="button" @click="setListingStatus(l, 'archived')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/70 hover:bg-white/10"><BIcon name="Archive" class="w-3.5 h-3.5" /> {{ gt('archive') }}</button>
              <button v-else type="button" @click="setListingStatus(l, 'active')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/70 hover:bg-white/10"><BIcon name="ArchiveRestore" class="w-3.5 h-3.5" /> {{ gt('restore') }}</button>
              <button type="button" @click="deleteListing(l)" :aria-label="gt('del')" class="ml-auto w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center"><BIcon name="Trash2" class="w-4 h-4" /></button>
            </div>
          </div>
        </article>
      </div>
      <div v-if="listings && listings.pages > 1" class="flex items-center justify-center gap-2 mt-5">
        <button @click="lPage--; fetchListings()" :disabled="lPage <= 1" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/60 disabled:opacity-30">{{ gt('prev') }}</button>
        <span class="text-xs font-bold text-white/40 px-3">{{ lPage }} / {{ listings.pages }}</span>
        <button @click="lPage++; fetchListings()" :disabled="lPage >= listings.pages" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/60 disabled:opacity-30">{{ gt('next') }}</button>
      </div>
    </template>

    <!-- ═════ Disputes ═════ -->
    <template v-else-if="view === 'disputes'">
      <div class="flex gap-2 mb-5">
        <button v-for="f in (['open', 'resolved'] as const)" :key="f" type="button" @click="dFilter = f; fetchDisputes()"
          class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
          :class="dFilter === f ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent' : 'bg-brand-card border-brand-border text-white/45 hover:text-white/75'">{{ f === 'open' ? gt('dOpen') : gt('dResolved') }}</button>
      </div>
      <div v-if="disputesFailed && !disputes" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchDisputes" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!disputes" class="h-40 rounded-2xl bg-white/5 animate-pulse" />
      <div v-else-if="!disputes.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
        <BIcon name="Gavel" class="w-10 h-10 opacity-40" /><p class="text-sm font-semibold">{{ gt('noDisputes') }}</p>
      </div>
      <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <article v-for="d in disputes" :key="d.id" class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden flex flex-col">
          <div class="p-4 flex gap-3 border-b border-brand-border">
            <img v-if="d.listing.image" :src="d.listing.image" alt="" loading="lazy" class="w-14 h-14 rounded-xl object-cover shrink-0" />
            <div class="min-w-0 flex-1">
              <router-link :to="`/dealers-den/${d.listing.id}`" target="_blank" class="font-extrabold text-white truncate hover:text-brand-accent block">{{ d.listing.title }}</router-link>
              <p class="text-xs text-white/40">{{ fmtMoney(d.listing.price, d.listing.currency) }} · {{ formatDate(d.opened_at) }}</p>
            </div>
            <span v-if="d.status !== 'open'" class="text-[10px] font-extrabold px-2 py-1 h-fit rounded-full" :class="d.status === 'resolved_buyer' ? 'bg-sky-500/15 text-sky-400' : 'bg-emerald-500/15 text-emerald-400'">{{ d.status === 'resolved_buyer' ? gt('resolvedBuyer') : gt('resolvedSeller') }}</span>
          </div>
          <div class="p-4 flex flex-col gap-3">
            <div class="text-xs text-white/50 flex gap-4 flex-wrap">
              <span>{{ gt('buyer') }}: <router-link :to="`/profile/${d.buyer.username}`" target="_blank" class="font-bold text-white/70 hover:text-brand-accent">@{{ d.buyer.username }}</router-link></span>
              <span>{{ gt('seller') }}: <router-link :to="`/profile/${d.seller.username}`" target="_blank" class="font-bold text-white/70 hover:text-brand-accent">@{{ d.seller.username }}</router-link></span>
            </div>
            <div class="rounded-xl bg-rose-500/6 border border-rose-500/10 p-3"><p class="text-[10px] font-bold text-rose-300/70 uppercase mb-1">{{ gt('reason') }}</p><p class="text-sm text-white/75 whitespace-pre-line wrap-break-word">{{ d.reason }}</p></div>
            <div class="rounded-xl bg-white/4 p-3"><p class="text-[10px] font-bold text-white/35 uppercase mb-1">{{ gt('sellerReply') }}</p>
              <p v-if="d.seller_reply" class="text-sm text-white/70 whitespace-pre-line wrap-break-word">{{ d.seller_reply }}</p><p v-else class="text-xs text-white/30 italic">{{ gt('noReply') }}</p></div>
            <div v-if="d.resolution" class="rounded-xl bg-emerald-500/6 border border-emerald-500/10 p-3"><p class="text-[10px] font-bold text-emerald-300/70 uppercase mb-1">{{ gt('resolution') }}</p><p class="text-sm text-white/70">{{ d.resolution }}</p></div>
          </div>
          <div v-if="d.status === 'open'" class="border-t border-white/6 bg-white/2 px-4 py-3 flex gap-2">
            <button type="button" @click="resolveDispute(d, 'buyer')" :disabled="resolvingId === d.id" class="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 disabled:opacity-50">{{ gt('winBuyer') }}</button>
            <button type="button" @click="resolveDispute(d, 'seller')" :disabled="resolvingId === d.id" class="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50">{{ gt('winSeller') }}</button>
          </div>
        </article>
      </div>
    </template>

    <!-- ═════ Fairs ═════ -->
    <template v-else-if="view === 'fairs'">
      <div class="flex mb-5">
        <button type="button" @click="openFairForm" class="ml-auto flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-all"><BIcon name="Plus" class="w-4 h-4" /> {{ gt('newFair') }}</button>
      </div>
      <div v-if="fairsFailed && !fairs" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchFairs" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!fairs" class="h-40 rounded-2xl bg-white/5 animate-pulse" />
      <div v-else-if="!fairs.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
        <BIcon name="CalendarDays" class="w-10 h-10 opacity-40" /><p class="text-sm font-semibold">{{ gt('noFairs') }}</p>
      </div>
      <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <article v-for="f in fairs" :key="f.id" class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden">
          <img v-if="f.banner_url" :src="f.banner_url" alt="" loading="lazy" class="w-full h-24 object-cover" />
          <div class="p-4 flex flex-col gap-3">
            <div class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <p class="font-extrabold text-white">{{ f.title }}</p>
                <p class="text-xs text-white/40">{{ formatDate(f.starts_at) }} — {{ formatDate(f.ends_at) }}<template v-if="f.theme"> · {{ f.theme }}</template> · {{ f.participants.length }} {{ gt('participants') }}</p>
              </div>
              <select :value="f.status" @change="setFairStatus(f, ($event.target as HTMLSelectElement).value)" class="bg-white/6 rounded-xl px-2.5 py-1.5 text-xs font-bold text-white/70 outline-hidden">
                <option v-for="s in ['upcoming', 'open', 'closed']" :key="s" :value="s" class="bg-[#1F223C]">{{ gt('fs_' + s) }}</option>
              </select>
            </div>
            <p v-if="f.description" class="text-xs text-white/50 line-clamp-2">{{ f.description }}</p>
            <div>
              <p class="text-[10px] font-bold text-white/35 uppercase mb-2">{{ gt('applications') }}</p>
              <p v-if="!f.participants.length" class="text-xs text-white/25">{{ gt('noParticipants') }}</p>
              <div v-for="p in f.participants" :key="p.id" class="flex items-center gap-2.5 py-2 border-t border-brand-border first:border-0">
                <img v-if="p.user.avatar_url" :src="p.user.avatar_url" alt="" loading="lazy" class="w-8 h-8 rounded-full object-cover shrink-0" />
                <div v-else class="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-xs font-bold text-white/40 shrink-0">{{ initial(p.user.display_name || p.user.username) }}</div>
                <div class="min-w-0 flex-1">
                  <router-link :to="`/profile/${p.user.username}`" target="_blank" class="text-xs font-bold text-white/80 hover:text-brand-accent truncate block">@{{ p.user.username }}</router-link>
                  <p class="text-[11px] text-white/35 truncate">{{ p.listing?.title ?? '—' }} · {{ formatDate(p.created_at) }}</p>
                </div>
                <template v-if="p.status === 'pending'">
                  <button type="button" @click="decideParticipant(f, p, 'approved')" :aria-label="gt('approve')" :title="gt('approve')" class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center"><BIcon name="Check" class="w-4 h-4" /></button>
                  <button type="button" @click="decideParticipant(f, p, 'rejected')" :aria-label="gt('reject')" :title="gt('reject')" class="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center"><BIcon name="X" class="w-4 h-4" /></button>
                </template>
                <span v-else class="text-[10px] font-extrabold px-2 py-0.5 rounded-full" :class="participantClass(p.status)">{{ gt('ps_' + p.status) }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </template>

    <!-- ═════ Frame requests ═════ -->
    <template v-else-if="view === 'frames'">
      <div class="flex gap-2 mb-5">
        <button v-for="s in (['pending', 'approved', 'rejected'] as const)" :key="s" type="button" @click="frameFilter = s; fetchFrames()"
          class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
          :class="frameFilter === s ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent' : 'bg-brand-card border-brand-border text-white/45 hover:text-white/75'">{{ gt('fr_' + s) }}</button>
      </div>
      <div v-if="framesFailed && !frames" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchFrames" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!frames" class="h-40 rounded-2xl bg-white/5 animate-pulse" />
      <div v-else-if="!frames.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
        <BIcon name="Frame" class="w-10 h-10 opacity-40" /><p class="text-sm font-semibold">{{ gt('noFrames') }}</p>
      </div>
      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <article v-for="f in frames" :key="f.id" class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden flex flex-col">
          <div class="h-44 flex items-center justify-center" style="background:repeating-conic-gradient(rgba(255,255,255,0.06) 0% 25%, transparent 0% 50%) 50% / 20px 20px">
            <img :src="f.image_url" alt="" loading="lazy" class="max-h-40 max-w-[85%] object-contain" />
          </div>
          <div class="p-4 flex flex-col gap-1.5 flex-1">
            <p class="font-extrabold text-white truncate">{{ f.name }}</p>
            <p class="text-xs text-white/45">{{ gt('by') }} <router-link :to="`/profile/${f.creator.username}`" target="_blank" class="font-bold text-white/65 hover:text-brand-accent">@{{ f.creator.username }}</router-link> · {{ gt('framePrice') }}: {{ Number(f.price) ? Number(f.price) + ' ₽' : gt('free') }}</p>
            <p class="text-[11px] text-white/30">{{ formatDate(f.created_at) }}</p>
            <p v-if="f.rejection_reason" class="text-xs text-rose-300/80">{{ gt('rejectedWhy') }}: {{ f.rejection_reason }}</p>
          </div>
          <div v-if="f.status === 'pending'" class="border-t border-white/6 bg-white/2 px-4 py-3 flex gap-2">
            <button type="button" @click="reviewFrame(f, 'approve')" :disabled="framesBusy[f.id]" class="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5"><BIcon name="Check" class="w-3.5 h-3.5" /> {{ gt('approve') }}</button>
            <button type="button" @click="reviewFrame(f, 'reject')" :disabled="framesBusy[f.id]" class="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5"><BIcon name="X" class="w-3.5 h-3.5" /> {{ gt('reject') }}</button>
          </div>
        </article>
      </div>
    </template>

    <!-- ═════ Seller groups ═════ -->
    <template v-else>
      <div v-if="denGroupsFailed && !denGroups" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchDenGroups" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!denGroups" class="h-40 rounded-2xl bg-white/5 animate-pulse" />
      <div v-else-if="!denGroups.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
        <BIcon name="Users" class="w-10 h-10 opacity-40" /><p class="text-sm font-semibold">{{ gt('noGroups') }}</p>
      </div>
      <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <article v-for="g in denGroups" :key="g.id" class="rounded-2xl border border-brand-border bg-brand-card p-4 flex items-center gap-4">
          <img v-if="g.avatarUrl" :src="g.avatarUrl" alt="" loading="lazy" class="w-14 h-14 rounded-2xl object-cover shrink-0" />
          <div v-else class="w-14 h-14 rounded-2xl bg-brand-accent/20 flex items-center justify-center text-lg font-black text-brand-accent shrink-0">{{ initial(g.name) }}</div>
          <div class="min-w-0 flex-1">
            <router-link :to="`/groups/${g.slug}`" target="_blank" class="font-extrabold text-white truncate hover:text-brand-accent block">{{ g.name }}</router-link>
            <p class="text-xs text-white/45">{{ gt('owner') }}: <router-link :to="`/profile/${g.owner.username}`" target="_blank" class="font-bold text-white/65 hover:text-brand-accent">@{{ g.owner.username }}</router-link></p>
            <p class="text-[11px] text-white/35">{{ formatNum(g.members) }} {{ gt('members') }} · {{ g.activeListings }} {{ gt('activeListings') }}<template v-if="g.agreedAt"> · {{ gt('agreed') }} {{ formatDate(g.agreedAt) }}</template></p>
          </div>
          <button type="button" @click="disconnectGroup(g)" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 shrink-0">{{ gt('disconnect') }}</button>
        </article>
      </div>
    </template>

    <!-- Fair form -->
    <Teleport to="body">
      <div v-if="fairForm" class="fixed inset-0 z-130 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" @click.self="fairForm = null">
        <div class="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-brand-card border border-brand-border shadow-2xl p-6 flex flex-col gap-3">
          <h3 class="text-xl font-extrabold text-white">{{ gt('newFair') }}</h3>
          <label class="text-xs font-bold text-white/45">{{ gt('fTitle') }}<input v-model="fairForm.title" maxlength="200" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden" /></label>
          <label class="text-xs font-bold text-white/45">{{ gt('fTheme') }}<input v-model="fairForm.theme" maxlength="100" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden" /></label>
          <label class="text-xs font-bold text-white/45">{{ gt('fBanner') }}<input v-model="fairForm.bannerUrl" placeholder="https://…" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden" /></label>
          <label class="text-xs font-bold text-white/45">Описание / Description<textarea v-model="fairForm.description" rows="3" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden resize-none" /></label>
          <div class="grid grid-cols-2 gap-3">
            <label class="text-xs font-bold text-white/45">{{ gt('fStarts') }}<input v-model="fairForm.startsAt" type="datetime-local" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden" /></label>
            <label class="text-xs font-bold text-white/45">{{ gt('fEnds') }}<input v-model="fairForm.endsAt" type="datetime-local" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden" /></label>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" @click="fairForm = null" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/6 text-white/60">{{ gt('cancel') }}</button>
            <button type="button" @click="saveFair" :disabled="savingFair || !fairForm.title.trim() || !fairForm.startsAt || !fairForm.endsAt" class="px-4 py-2 rounded-xl text-xs font-bold bg-brand-accent/25 text-brand-accent disabled:opacity-40">{{ gt('create') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
