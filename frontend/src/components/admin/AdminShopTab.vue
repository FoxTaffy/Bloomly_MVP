<script setup lang="ts">
import { ref, computed, watchEffect, onActivated } from 'vue'
import api from '@/api'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from '@/components/BIcon.vue'
import { formatNum, formatDate } from './adminHelpers'
import { useAdminContext } from './adminContext'
import { useMarketT } from './market/strings'
import ShopStickerStats from './market/ShopStickerStats.vue'
import ShopTypeStats from './market/ShopTypeStats.vue'

const gt = useMarketT()
const { confirmDialog } = useConfirm()
const { badges, reportAdminError } = useAdminContext()

type View = 'overview' | 'stats' | 'items' | 'packs' | 'requests'
const view = ref<View>('overview')
const TYPES = ['sticker_pack', 'theme', 'background', 'frame'] as const
const STATUSES = ['published', 'hidden', 'draft'] as const
const typeLabel = (t: string) => gt(`t_${t}`)
const fmtPrice = (n: number, free?: boolean) => (free || !n ? gt('free') : `${n.toLocaleString('ru-RU')} ₽`)

// ── Overview ────────────────────────────────────────────────────────────
const overview = ref<any>(null)
const overviewFailed = ref(false)
const fetchOverview = async () => {
  overviewFailed.value = false
  try {
    const res = await api.get('/admin/shop/overview')
    if (res.data.success) overview.value = res.data.data
    else overviewFailed.value = true
  } catch { overviewFailed.value = true }
}
const tiles = computed(() => !overview.value ? [] : [
  { label: gt('kItems'), value: overview.value.stats.items, foot: `${overview.value.stats.paid} ${gt('paidFree')} · ${overview.value.stats.free} ${gt('freeN')}`, color: '#4C67CF', bg: 'rgba(76,103,207,0.09)' },
  { label: gt('kPurchases'), value: overview.value.stats.purchases, sub: `+${overview.value.stats.purchasesWeek} ${gt('thisWeek')}`, color: '#10b981', bg: 'rgba(16,185,129,0.07)' },
  { label: gt('kTurnover'), value: `${formatNum(overview.value.stats.turnover)} ₽`, color: '#f59e0b', bg: 'rgba(245,158,11,0.07)' },
  { label: gt('kDownloads'), value: overview.value.stats.downloads, color: '#a78bfa', bg: 'rgba(167,139,250,0.07)' },
  { label: gt('kPacks'), value: overview.value.stats.packs.published, foot: `${overview.value.stats.packs.paid} ${gt('paidPacks')}`, color: '#38bdf8', bg: 'rgba(56,189,248,0.07)' },
  { label: gt('kPendingAccess'), value: overview.value.stats.packs.pendingAccess, color: '#f43f5e', bg: 'rgba(244,63,94,0.07)' },
])

// ── Items ───────────────────────────────────────────────────────────────
const items = ref<any>(null)
const itemsLoading = ref(false)
const itemsFailed = ref(false)
const itemSearch = ref('')
const itemType = ref('')
const itemStatus = ref('')
const itemPage = ref(1)
let itemDebounce: ReturnType<typeof setTimeout>
const fetchItems = async () => {
  itemsLoading.value = true
  itemsFailed.value = false
  try {
    const res = await api.get('/admin/shop/items', { params: { search: itemSearch.value || undefined, type: itemType.value || undefined, status: itemStatus.value || undefined, page: itemPage.value } })
    if (res.data.success) items.value = res.data.data
    else itemsFailed.value = true
  } catch { itemsFailed.value = true } finally { itemsLoading.value = false }
}
const onItemSearch = () => { clearTimeout(itemDebounce); itemDebounce = setTimeout(() => { itemPage.value = 1; fetchItems() }, 300) }
const setItemFilter = (kind: 'type' | 'status', v: string) => { (kind === 'type' ? itemType : itemStatus).value = v; itemPage.value = 1; fetchItems() }

// form
const emptyForm = () => ({ id: '', type: 'theme', name: '', description: '', preview_url: '', price: 0, is_free: false, is_official: true, is_nsfw: false, tags: '', status: 'published' })
const form = ref<ReturnType<typeof emptyForm> | null>(null)
const saving = ref(false)
const openCreate = () => { form.value = emptyForm() }
const openEdit = (i: any) => {
  form.value = { id: i.id, type: i.type, name: i.name, description: i.description ?? '', preview_url: i.previewUrl ?? '', price: i.price, is_free: i.isFree, is_official: i.isOfficial, is_nsfw: i.isNsfw, tags: i.tags.join(', '), status: i.status }
}
const saveForm = async () => {
  const f = form.value
  if (!f || saving.value || !f.name.trim()) return
  saving.value = true
  const body = {
    type: f.type, name: f.name, description: f.description || null, preview_url: f.preview_url || null,
    price: f.is_free ? 0 : Number(f.price) || 0, is_free: f.is_free, is_official: f.is_official, is_nsfw: f.is_nsfw,
    tags: f.tags.split(',').map(t => t.trim()).filter(Boolean), status: f.status,
  }
  try {
    if (f.id) await api.patch(`/admin/shop/items/${f.id}`, body)
    else await api.post('/admin/shop/items', body)
    form.value = null
    await Promise.all([fetchItems(), fetchOverview()])
  } catch (e) { reportAdminError(e) } finally { saving.value = false }
}
const setItemStatusQuick = async (i: any, status: string) => {
  try { await api.patch(`/admin/shop/items/${i.id}`, { status }); i.status = status; fetchOverview() } catch (e) { reportAdminError(e) }
}
const deleteItem = async (i: any) => {
  if (!(await confirmDialog(gt('confirmDeleteItem'), { danger: true }))) return
  try { await api.delete(`/admin/shop/items/${i.id}`); await Promise.all([fetchItems(), fetchOverview()]) } catch (e) { reportAdminError(e) }
}

// ── Packs ───────────────────────────────────────────────────────────────
const packs = ref<any>(null)
const packsLoading = ref(false)
const packsFailed = ref(false)
const packSearch = ref('')
const packStatus = ref('')
const packPage = ref(1)
let packDebounce: ReturnType<typeof setTimeout>
const fetchPacks = async () => {
  packsLoading.value = true
  packsFailed.value = false
  try {
    const res = await api.get('/admin/shop/packs', { params: { search: packSearch.value || undefined, status: packStatus.value || undefined, page: packPage.value } })
    if (res.data.success) packs.value = res.data.data
    else packsFailed.value = true
  } catch { packsFailed.value = true } finally { packsLoading.value = false }
}
const onPackSearch = () => { clearTimeout(packDebounce); packDebounce = setTimeout(() => { packPage.value = 1; fetchPacks() }, 300) }
const togglePack = async (p: any) => {
  const next = p.status === 'published' ? 'draft' : 'published'
  if (next === 'draft' && !(await confirmDialog(gt('confirmHidePack'), { danger: true }))) return
  try { await api.patch(`/admin/shop/packs/${p.id}/status`, { status: next }); p.status = next; fetchOverview() } catch (e) { reportAdminError(e) }
}

// ── Access requests ─────────────────────────────────────────────────────
const requests = ref<any[] | null>(null)
const requestsFailed = ref(false)
const fetchRequests = async () => {
  requestsFailed.value = false
  try {
    const res = await api.get('/admin/shop/access-requests')
    if (res.data.success) requests.value = res.data.data.requests
    else requestsFailed.value = true
  } catch { requestsFailed.value = true }
}

// ── Statistics: one inner tab per kind of goods ─────────────────────────
type StatsKind = 'sticker' | 'frame' | 'background' | 'theme'
const STATS_KINDS: { key: StatsKind; label: string; icon: string }[] = [
  { key: 'sticker', label: 'Стикеры', icon: 'Sticker' },
  { key: 'frame', label: 'Рамки', icon: 'Frame' },
  { key: 'background', label: 'Фоны', icon: 'Image' },
  { key: 'theme', label: 'Темы', icon: 'Palette' },
]
const statsKind = ref<StatsKind>('sticker')

const switchView = (v: View) => {
  view.value = v
  if (v === 'items' && !items.value) fetchItems()
  if (v === 'packs' && !packs.value) fetchPacks()
  if (v === 'requests' && !requests.value) fetchRequests()
}
onActivated(() => { if (!overview.value) fetchOverview() })
watchEffect(() => { badges.shop = overview.value?.stats.packs.pendingAccess ?? 0 })

const initial = (n?: string | null) => (n || '?')[0].toUpperCase()
const statusClass = (s: string) => s === 'published' ? 'bg-emerald-500/15 text-emerald-400' : s === 'hidden' ? 'bg-rose-500/15 text-rose-400' : 'bg-white/8 text-white/50'
</script>

<template>
  <div>
    <!-- Sub-views -->
    <div class="flex items-center gap-2 mb-5 p-1 rounded-2xl bg-white/4 w-fit flex-wrap">
      <button v-for="v in (['overview', 'stats', 'items', 'packs', 'requests'] as const)" :key="v" type="button" @click="switchView(v)"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
        :class="view === v ? 'bg-brand-accent/20 text-brand-accent' : 'text-white/40 hover:text-white/70'">
        <BIcon :name="{ overview: 'LayoutDashboard', stats: 'BarChart2', items: 'ShoppingBag', packs: 'Sparkles', requests: 'Gift' }[v]" class="w-3.5 h-3.5" />
        {{ v === 'stats' ? 'Статистика' : gt({ overview: 'shopOverview', items: 'shopItems', packs: 'shopPacks', requests: 'shopRequests' }[v]) }}
        <span v-if="v === 'requests' && overview?.stats.packs.pendingAccess" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-400/20 text-rose-300">{{ overview.stats.packs.pendingAccess }}</span>
      </button>
    </div>

    <!-- ═════ Statistics ═════ -->
    <template v-if="view === 'stats'">
      <div class="flex gap-2 mb-5 flex-wrap">
        <button v-for="k in STATS_KINDS" :key="k.key" type="button" @click="statsKind = k.key"
          class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
          :class="statsKind === k.key ? 'text-white border border-emerald-500/30' : 'text-white/40 hover:text-white/70 bg-white/3 border border-brand-border'"
          :style="statsKind === k.key ? 'background:rgba(16,185,129,0.12)' : ''">
          <BIcon :name="k.icon" class="w-4 h-4" /> {{ k.label }}
        </button>
      </div>
      <ShopStickerStats v-if="statsKind === 'sticker'" />
      <ShopTypeStats v-else :type="statsKind" />
    </template>

    <!-- ═════ Overview ═════ -->
    <template v-else-if="view === 'overview'">
      <div v-if="overviewFailed" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchOverview" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 hover:bg-white/12 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!overview" class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <div v-for="n in 6" :key="n" class="h-28 rounded-2xl bg-white/5 animate-pulse" />
      </div>
      <template v-else>
        <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2.5 mb-5">
          <div v-for="t in tiles" :key="t.label" class="rounded-2xl px-4 py-3" :style="`background:${t.bg}`">
            <p class="text-[10px] font-bold uppercase tracking-wide truncate" :style="`color:${t.color}b3`">{{ t.label }}</p>
            <p class="text-2xl font-black mt-0.5" :style="`color:${t.color}`">{{ typeof t.value === 'number' ? formatNum(t.value) : t.value }}</p>
            <p v-if="t.sub" class="text-[11px] font-bold text-white/55 mt-0.5">{{ t.sub }}</p>
            <p v-if="t.foot" class="text-[10px] text-white/30 mt-1 truncate">{{ t.foot }}</p>
          </div>
        </div>
        <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
            <h3 class="font-extrabold text-white text-sm mb-4">{{ gt('byType') }}</h3>
            <div v-for="t in overview.byType" :key="t.type" class="flex items-center justify-between py-1.5 text-sm">
              <span class="text-white/65">{{ typeLabel(t.type) }}</span><span class="font-bold text-white">{{ t.count }}</span>
            </div>
            <div class="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-brand-border">
              <span v-for="s in overview.byStatus" :key="s.status" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full" :class="statusClass(s.status)">{{ gt('s_' + s.status) }} · {{ s.count }}</span>
            </div>
          </div>
          <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
            <h3 class="font-extrabold text-white text-sm mb-4">{{ gt('topItems') }}</h3>
            <p v-if="!overview.topItems.length" class="text-xs text-white/25 py-4 text-center">{{ gt('empty') }}</p>
            <div v-for="i in overview.topItems" :key="i.id" class="flex items-center gap-3 py-1.5">
              <img v-if="i.preview_url" :src="i.preview_url" alt="" loading="lazy" class="w-9 h-9 rounded-lg object-cover shrink-0" />
              <div v-else class="w-9 h-9 rounded-lg bg-white/6 flex items-center justify-center shrink-0"><BIcon name="ShoppingBag" class="w-4 h-4 text-white/30" /></div>
              <div class="min-w-0 flex-1"><p class="text-sm font-bold text-white truncate">{{ i.name }}</p><p class="text-[11px] text-white/35">{{ typeLabel(i.type) }} · {{ fmtPrice(i.price, i.is_free) }}</p></div>
              <span class="text-xs font-bold text-white/60 shrink-0">{{ formatNum(i.downloads_count) }}</span>
            </div>
          </div>
          <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
            <h3 class="font-extrabold text-white text-sm mb-4">{{ gt('recentPurchases') }}</h3>
            <p v-if="!overview.recentPurchases.length" class="text-xs text-white/25 py-4 text-center">{{ gt('empty') }}</p>
            <div v-for="(r, idx) in overview.recentPurchases" :key="idx" class="py-1.5 text-xs">
              <p class="text-white/70 truncate"><span class="font-bold text-white">@{{ r.user.username }}</span> → {{ r.item.name }}</p>
              <p class="text-white/30">{{ fmtPrice(r.item.price, r.item.is_free) }} · {{ formatDate(r.purchasedAt) }}</p>
            </div>
          </div>
        </div>
      </template>
    </template>

    <!-- ═════ Items ═════ -->
    <template v-else-if="view === 'items'">
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="relative flex-1 max-w-sm min-w-[200px]">
          <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input v-model="itemSearch" @input="onItemSearch" type="text" :placeholder="gt('search')"
            class="w-full bg-white/6 border border-transparent rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25 outline-hidden focus:border-brand-accent/40 transition-all" />
        </div>
        <button type="button" @click="openCreate" class="ml-auto flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold bg-brand-accent/20 text-brand-accent hover:bg-brand-accent/30 transition-all">
          <BIcon name="Plus" class="w-4 h-4" /> {{ gt('newItem') }}
        </button>
      </div>
      <div class="flex flex-wrap gap-2 mb-5">
        <button v-for="t in ['', ...TYPES]" :key="t" type="button" @click="setItemFilter('type', t)"
          class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
          :class="itemType === t ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent' : 'bg-brand-card border-brand-border text-white/45 hover:text-white/75'">{{ t ? typeLabel(t) : gt('all') }}</button>
        <span class="w-px bg-white/10 mx-1" />
        <button v-for="s in ['', ...STATUSES]" :key="s" type="button" @click="setItemFilter('status', s)"
          class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
          :class="itemStatus === s ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent' : 'bg-brand-card border-brand-border text-white/45 hover:text-white/75'">{{ s ? gt('s_' + s) : gt('all') }}</button>
      </div>

      <div v-if="itemsFailed && !items" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchItems" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!items" class="grid grid-cols-1 xl:grid-cols-2 gap-4"><div v-for="n in 4" :key="n" class="h-36 rounded-2xl bg-white/5 animate-pulse" /></div>
      <div v-else-if="!items.items.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
        <BIcon name="ShoppingBag" class="w-10 h-10 opacity-40" /><p class="text-sm font-semibold">{{ gt('empty') }}</p>
      </div>
      <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4" :class="{ 'opacity-60 pointer-events-none': itemsLoading }">
        <article v-for="i in items.items" :key="i.id" class="rounded-2xl border border-brand-border bg-brand-card p-4 flex gap-4">
          <img v-if="i.previewUrl" :src="i.previewUrl" alt="" loading="lazy" class="w-24 h-24 rounded-xl object-cover shrink-0 bg-black/20" />
          <div v-else class="w-24 h-24 rounded-xl bg-white/5 flex items-center justify-center shrink-0"><BIcon name="ImageOff" class="w-6 h-6 text-white/25" /></div>
          <div class="min-w-0 flex-1 flex flex-col gap-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full" :class="statusClass(i.status)">{{ gt('s_' + i.status) }}</span>
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/8 text-white/55">{{ typeLabel(i.type) }}</span>
              <span v-if="i.isOfficial" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300">{{ gt('official') }}</span>
              <span v-if="i.isNsfw" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">NSFW</span>
            </div>
            <p class="font-extrabold text-white truncate">{{ i.name }}</p>
            <p class="text-xs text-white/40 line-clamp-2">{{ i.description || '—' }}</p>
            <p class="text-xs text-white/50"><span class="font-bold" :class="i.isFree || !i.price ? 'text-emerald-400' : 'text-amber-400'">{{ fmtPrice(i.price, i.isFree) }}</span>
              · {{ formatNum(i.owners) }} {{ gt('owners') }} · {{ formatNum(i.downloads) }} {{ gt('downloads') }} · {{ formatDate(i.createdAt) }}</p>
            <div class="mt-auto flex items-center gap-2 pt-1 flex-wrap">
              <button type="button" @click="openEdit(i)" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/70 hover:bg-white/10"><BIcon name="Pencil" class="w-3.5 h-3.5" /> {{ gt('edit') }}</button>
              <button type="button" @click="setItemStatusQuick(i, i.status === 'published' ? 'hidden' : 'published')"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/70 hover:bg-white/10">
                <BIcon :name="i.status === 'published' ? 'EyeOff' : 'Eye'" class="w-3.5 h-3.5" /> {{ i.status === 'published' ? gt('hide') : gt('publish') }}
              </button>
              <button type="button" @click="deleteItem(i)" :aria-label="gt('del')" class="ml-auto w-8 h-8 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center"><BIcon name="Trash2" class="w-4 h-4" /></button>
            </div>
          </div>
        </article>
      </div>
      <div v-if="items && items.pages > 1" class="flex items-center justify-center gap-2 mt-5">
        <button @click="itemPage--; fetchItems()" :disabled="itemPage <= 1" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/60 disabled:opacity-30">{{ gt('prev') }}</button>
        <span class="text-xs font-bold text-white/40 px-3">{{ itemPage }} / {{ items.pages }}</span>
        <button @click="itemPage++; fetchItems()" :disabled="itemPage >= items.pages" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/60 disabled:opacity-30">{{ gt('next') }}</button>
      </div>
    </template>

    <!-- ═════ Sticker packs ═════ -->
    <template v-else-if="view === 'packs'">
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="relative flex-1 max-w-sm min-w-[200px]">
          <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input v-model="packSearch" @input="onPackSearch" type="text" :placeholder="gt('search')"
            class="w-full bg-white/6 border border-transparent rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25 outline-hidden focus:border-brand-accent/40 transition-all" />
        </div>
        <button v-for="s in ['', 'published', 'draft']" :key="s" type="button" @click="packStatus = s; packPage = 1; fetchPacks()"
          class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all"
          :class="packStatus === s ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent' : 'bg-brand-card border-brand-border text-white/45 hover:text-white/75'">{{ s ? gt('s_' + s) : gt('all') }}</button>
      </div>
      <div v-if="packsFailed && !packs" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchPacks" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!packs" class="grid grid-cols-1 xl:grid-cols-2 gap-4"><div v-for="n in 4" :key="n" class="h-32 rounded-2xl bg-white/5 animate-pulse" /></div>
      <div v-else-if="!packs.packs.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
        <BIcon name="Sparkles" class="w-10 h-10 opacity-40" /><p class="text-sm font-semibold">{{ gt('empty') }}</p>
      </div>
      <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4" :class="{ 'opacity-60 pointer-events-none': packsLoading }">
        <article v-for="p in packs.packs" :key="p.id" class="rounded-2xl border border-brand-border bg-brand-card p-4 flex gap-4">
          <img v-if="p.coverUrl" :src="p.coverUrl" alt="" loading="lazy" class="w-20 h-20 rounded-xl object-contain shrink-0 bg-black/20" />
          <div v-else class="w-20 h-20 rounded-xl bg-white/5 flex items-center justify-center shrink-0"><BIcon name="ImageOff" class="w-6 h-6 text-white/25" /></div>
          <div class="min-w-0 flex-1 flex flex-col gap-1.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full" :class="statusClass(p.status)">{{ gt('s_' + p.status) }}</span>
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/8 text-white/55">{{ gt('vis') }}: {{ p.visibility }}</span>
              <span v-if="p.isNsfw" class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">NSFW</span>
            </div>
            <router-link :to="`/stickers/${p.id}`" target="_blank" class="font-extrabold text-white truncate hover:text-brand-accent">{{ p.name }}</router-link>
            <p class="text-xs text-white/45">{{ gt('by') }} <router-link :to="`/profile/${p.author.username}`" target="_blank" class="font-bold text-white/65 hover:text-brand-accent">@{{ p.author.username }}</router-link> · {{ fmtPrice(p.price) }} · {{ formatDate(p.createdAt) }}</p>
            <p class="text-xs text-white/40">{{ p.stickerCount }} {{ gt('stickers') }} · {{ formatNum(p.collections) }} {{ gt('collections') }} · {{ formatNum(p.uses) }} {{ gt('uses') }}</p>
            <div class="mt-auto pt-1">
              <button type="button" @click="togglePack(p)" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/70 hover:bg-white/10">
                <BIcon :name="p.status === 'published' ? 'EyeOff' : 'Eye'" class="w-3.5 h-3.5" /> {{ p.status === 'published' ? gt('hidePack') : gt('publishPack') }}
              </button>
            </div>
          </div>
        </article>
      </div>
      <div v-if="packs && packs.pages > 1" class="flex items-center justify-center gap-2 mt-5">
        <button @click="packPage--; fetchPacks()" :disabled="packPage <= 1" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/60 disabled:opacity-30">{{ gt('prev') }}</button>
        <span class="text-xs font-bold text-white/40 px-3">{{ packPage }} / {{ packs.pages }}</span>
        <button @click="packPage++; fetchPacks()" :disabled="packPage >= packs.pages" class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/6 text-white/60 disabled:opacity-30">{{ gt('next') }}</button>
      </div>
    </template>

    <!-- ═════ Access requests ═════ -->
    <template v-else>
      <p class="text-xs text-white/35 mb-4">{{ gt('requestsHint') }}</p>
      <div v-if="requestsFailed && !requests" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/40">
        <p class="text-sm font-semibold">{{ gt('loadFailed') }}</p>
        <button type="button" @click="fetchRequests" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/8 text-white/70">{{ gt('retry') }}</button>
      </div>
      <div v-else-if="!requests" class="h-32 rounded-2xl bg-white/5 animate-pulse" />
      <div v-else-if="!requests.length" class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
        <BIcon name="Gift" class="w-10 h-10 opacity-40" /><p class="text-sm font-semibold">{{ gt('noRequests') }}</p>
      </div>
      <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div v-for="r in requests" :key="r.id" class="rounded-2xl border border-brand-border bg-brand-card p-4 flex items-center gap-3">
          <img v-if="r.user.avatar_url" :src="r.user.avatar_url" alt="" loading="lazy" class="w-10 h-10 rounded-full object-cover shrink-0" />
          <div v-else class="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center text-sm font-bold text-white/40 shrink-0">{{ initial(r.user.display_name || r.user.username) }}</div>
          <div class="min-w-0 flex-1">
            <p class="text-sm text-white/70 truncate"><span class="font-bold text-white">@{{ r.user.username }}</span> {{ gt('wants') }} <router-link :to="`/stickers/${r.pack.id}`" target="_blank" class="font-bold text-brand-accent hover:underline">{{ r.pack.name }}</router-link></p>
            <p class="text-[11px] text-white/30">{{ gt('by') }} @{{ r.pack.author.username }} · {{ formatDate(r.createdAt) }}</p>
          </div>
        </div>
      </div>
    </template>

    <!-- Item form -->
    <Teleport to="body">
      <div v-if="form" class="fixed inset-0 z-130 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" @click.self="form = null">
        <div class="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-brand-card border border-brand-border shadow-2xl p-6 flex flex-col gap-3">
          <h3 class="text-xl font-extrabold text-white">{{ form.id ? gt('editItem') : gt('newItem') }}</h3>
          <label class="text-xs font-bold text-white/45">{{ gt('fType') }}
            <select v-model="form.type" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden">
              <option v-for="t in TYPES" :key="t" :value="t" class="bg-[#1F223C]">{{ typeLabel(t) }}</option>
            </select>
          </label>
          <label class="text-xs font-bold text-white/45">{{ gt('fName') }}
            <input v-model="form.name" maxlength="120" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden focus:ring-1 ring-brand-accent/40" />
          </label>
          <label class="text-xs font-bold text-white/45">{{ gt('fDesc') }}
            <textarea v-model="form.description" rows="3" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden resize-none" />
          </label>
          <label class="text-xs font-bold text-white/45">{{ gt('fPreview') }}
            <input v-model="form.preview_url" placeholder="https://…" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden" />
          </label>
          <div class="grid grid-cols-2 gap-3">
            <label class="text-xs font-bold text-white/45">{{ gt('fPrice') }}
              <input v-model.number="form.price" type="number" min="0" step="1" :disabled="form.is_free" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden disabled:opacity-40" />
            </label>
            <label class="text-xs font-bold text-white/45">{{ gt('fStatus') }}
              <select v-model="form.status" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden">
                <option v-for="s in STATUSES" :key="s" :value="s" class="bg-[#1F223C]">{{ gt('s_' + s) }}</option>
              </select>
            </label>
          </div>
          <label class="text-xs font-bold text-white/45">{{ gt('fTags') }}
            <input v-model="form.tags" class="mt-1 w-full bg-white/6 rounded-xl px-3 py-2 text-sm text-white outline-hidden" />
          </label>
          <div class="flex flex-wrap gap-4 text-xs font-bold text-white/60">
            <label class="flex items-center gap-2"><input type="checkbox" v-model="form.is_free" /> {{ gt('fFree') }}</label>
            <label class="flex items-center gap-2"><input type="checkbox" v-model="form.is_official" /> {{ gt('fOfficial') }}</label>
            <label class="flex items-center gap-2"><input type="checkbox" v-model="form.is_nsfw" /> {{ gt('fNsfw') }}</label>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" @click="form = null" class="px-4 py-2 rounded-xl text-xs font-bold bg-white/6 text-white/60">{{ gt('cancel') }}</button>
            <button type="button" @click="saveForm" :disabled="saving || !form.name.trim()" class="px-4 py-2 rounded-xl text-xs font-bold bg-brand-accent/25 text-brand-accent disabled:opacity-40">{{ form.id ? gt('save') : gt('create') }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
