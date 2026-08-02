<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useDealersDenStore, type DealerListing, type ListingKind } from '@/stores/dealersDen'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useConfirm } from '@/composables/useConfirm'
import AppHeader    from '@/components/AppHeader.vue'
import AppSidebar   from '@/components/AppSidebar.vue'
import BIcon        from '@/components/BIcon.vue'
import MediaUpload  from '@/components/MediaUpload.vue'
import DenWeeklyTop from '@/components/DenWeeklyTop.vue'
import SubmitFrameModal from '@/components/SubmitFrameModal.vue'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const store  = useDealersDenStore()
const { confirmDialog } = useConfirm()
const { nsfwEnabled, canUseNsfw, enableNsfw } = useNsfwMode()

function handleEnableNsfw() {
  if (canUseNsfw.value) {
    enableNsfw()
    return
  }
  alert(langStore.t.dealersDenAgeConfirmAlert)
  router.push('/settings/profile')
}

// ── Permission ─────────────────────────────────────────────────────────────────
const canSell = computed(() => {
  const u = auth.user
  if (!u) return false
  return u.is_verified === true && (u.verification_type === 'artist' || u.verification_type === 'master')
})

// Avatar frames go through their own submission/approval flow (admins publish instantly,
// artist-verified users go into a moderation queue) — narrower than general Den selling rights.
const canSellFrames = computed(() => {
  const u = auth.user as any
  if (!u) return false
  return ['admin', 'owner'].includes(u.role) || (u.is_verified === true && u.verification_type === 'artist')
})
const showFrameModal = ref(false)

// ── Tabs ───────────────────────────────────────────────────────────────────────
type MainTab = 'browse' | 'my'
const activeTab = ref<MainTab>('browse')

// ── Categories ─────────────────────────────────────────────────────────────────
const CATS = computed(() => [
  { key: 'all',     label: langStore.t.tabAll,           icon: 'LayoutGrid' },
  { key: 'art',     label: langStore.t.dealersDenCatArt,  icon: 'Palette'    },
  { key: 'fursuit', label: langStore.t.fursuitTab,        icon: 'Sparkles'   },
  { key: 'sticker', label: langStore.t.stickers,          icon: 'Smile'      },
  { key: 'badge',   label: langStore.t.dealersDenCatBadges, icon: 'Award'    },
  { key: 'print',   label: langStore.t.dealersDenCatPrints, icon: 'Printer'  },
  { key: 'music',   label: langStore.t.dealersDenCatMusic, icon: 'Music'     },
  { key: 'craft',   label: 'Handmade',                    icon: 'Scissors'   },
  { key: 'merch',   label: langStore.t.dealersDenCatMerch, icon: 'Shirt'     },
  { key: 'avatar_frame', label: langStore.t.dealersDenCatFrame, icon: 'CircleDashed' },
  { key: 'other',   label: langStore.t.other,             icon: 'Package'    },
])
const selectedCategory = ref('all')

// ── Kind tabs ──────────────────────────────────────────────────────────────────
const KINDS = computed(() => [
  { key: '',                  label: langStore.t.tabAll,                 icon: 'LayoutGrid' },
  { key: 'fixed',             label: langStore.t.dealersDenKindFixed,    icon: 'Tag'        },
  { key: 'auction',           label: langStore.t.dealersDenKindAuction,  icon: 'Hammer'     },
  { key: 'ych',               label: 'YCH',                              icon: 'Paintbrush' },
  { key: 'raffle',            label: langStore.t.dealersDenKindRaffle,   icon: 'Gift'       },
  { key: 'commission_queue',  label: langStore.t.dealersDenKindCommissions, icon: 'ListOrdered'},
])
const selectedKind = ref<'' | ListingKind>('')

// ── Sort ───────────────────────────────────────────────────────────────────────
const SORTS = computed(() => [
  { key: 'newest',     label: langStore.t.dealersDenSortNewest },
  { key: 'price_asc',  label: langStore.t.dealersDenSortPriceAsc },
  { key: 'price_desc', label: langStore.t.dealersDenSortPriceDesc },
  { key: 'popular',    label: langStore.t.dealersDenSortPopular },
])
const selectedSort = ref('newest')

// ── Search & Type ──────────────────────────────────────────────────────────────
const selectedType  = ref<'' | 'digital' | 'physical' | 'both'>('')
const searchQuery   = ref('')
let   searchTimer: ReturnType<typeof setTimeout>
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => applyFilter(), 500)
}

// ── Listings ──────────────────────────────────────────────────────────────────
const displayListings = computed<DealerListing[]>(() => {
  if (activeTab.value === 'my') return store.myListings
  return store.listings
})

async function loadData() {
  const isStickerCat = selectedCategory.value === 'sticker'
  await Promise.all([
    store.loadListings({
      category:    !isStickerCat && selectedCategory.value !== 'all' ? selectedCategory.value as any : undefined,
      type:        selectedType.value  || undefined,
      listingKind: selectedKind.value  || undefined,
      search:      isStickerCat ? 'sticker' : (searchQuery.value || undefined),
      sort:        selectedSort.value !== 'newest' ? selectedSort.value : undefined,
      // NSFW показываем в ленте (блюрим на фронте)
    }),
    auth.user ? store.loadMyListings() : Promise.resolve(),
  ])
}

// Clicking a #hashtag chip (here or on a listing's detail page) lands here via
// ?search=<tag> — the same free-text search already OR-matches against tags server-side.
if (typeof route.query.search === 'string') {
  searchQuery.value = route.query.search
  selectedCategory.value = 'all'
}

function filterByTag(tag: string) {
  selectedCategory.value = 'all'
  searchQuery.value = tag
  applyFilter()
}

const trendingTags = ref<{ tag: string; count: number }[]>([])
store.getTrendingTags().then(tags => { trendingTags.value = tags }).catch(() => {})

onMounted(loadData)

// Перезагрузка при смене сортировки / NSFW-режима
watch([selectedSort, nsfwEnabled], () => applyFilter())

const showNsfwConfirm = ref(false)

function openListing(listing: DealerListing) {
  if (listing.is_nsfw && !nsfwEnabled.value) {
    showNsfwConfirm.value = true
    return
  }
  router.push({ name: 'dealer-listing', params: { id: listing.id } })
}

function applyFilter() { loadData() }
function selectCategory(key: string) { selectedCategory.value = key; loadData() }
function selectKind(k: string)       { selectedKind.value = k as any; loadData() }

// ── Countdown timer ────────────────────────────────────────────────────────────
const now = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval>
onMounted(() => { clockTimer = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { clearInterval(clockTimer); clearTimeout(searchTimer) })

function formatCountdown(endsAt: string | null): string {
  if (!endsAt) return ''
  const diff = new Date(endsAt).getTime() - now.value
  if (diff <= 0) return langStore.t.dealersDenAuctionEnded
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (d > 0) return `${d}${langStore.t.dealersDenDayAbbr} ${h}${langStore.t.dealersDenHourAbbr}`
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function isAuctionHot(endsAt: string | null) {
  if (!endsAt) return false
  return (new Date(endsAt).getTime() - now.value) < 3600000
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const CURRENCIES = ['USD', 'EUR', 'RUB', 'GBP', 'JPY', 'CNY']
const CAT_LABELS = computed<Record<string, string>>(() => ({
  art: langStore.t.dealersDenCatArt, fursuit: langStore.t.fursuitTab, badge: langStore.t.dealersDenCatBadge, print: langStore.t.dealersDenCatPrint,
  music: langStore.t.dealersDenCatMusic, craft: 'Handmade', merch: langStore.t.dealersDenCatMerch, sticker: langStore.t.dealersDenCatSticker, other: langStore.t.other,
}))
const TYPE_LABELS = computed<Record<string, string>>(() => ({ digital: langStore.t.dealersDenTypeDigital, physical: langStore.t.dealersDenTypePhysical, both: langStore.t.dealersDenTypeBoth }))
const TYPE_COLOR: Record<string, string> = {
  digital:  'text-brand-accent  bg-brand-accent/10  border-brand-accent/30',
  physical: 'text-brand-success bg-brand-success/10 border-brand-success/30',
  both:     'text-brand-yellow  bg-brand-yellow/10  border-brand-yellow/30',
}
const KIND_META = computed<Record<string, { label: string; icon: string; color: string; border: string; bg: string }>>(() => ({
  fixed:            { label: langStore.t.dealersDenKindFixed,    icon: 'Tag',         color: 'text-brand-accent',   border: 'border-brand-accent/40',   bg: 'bg-brand-accent/15'   },
  auction:          { label: langStore.t.dealersDenKindAuction,  icon: 'Hammer',      color: 'text-brand-yellow',   border: 'border-brand-yellow/40',   bg: 'bg-brand-yellow/15'   },
  ych:              { label: 'YCH',                              icon: 'Paintbrush',  color: 'text-brand-purple',   border: 'border-brand-purple/40',   bg: 'bg-brand-purple/15'   },
  raffle:           { label: langStore.t.dealersDenKindRaffle,   icon: 'Gift',        color: 'text-brand-success',  border: 'border-brand-success/40',  bg: 'bg-brand-success/15'  },
  commission_queue: { label: langStore.t.dealersDenKindCommissions, icon: 'ListOrdered', color: 'text-violet-400', border: 'border-violet-400/40',     bg: 'bg-violet-400/15'     },
}))

function isSoldOut(l: DealerListing) {
  return l.status === 'sold' || (l.quantity > 0 && l.quantity_sold >= l.quantity)
}
function formatPrice(price: string | number, currency: string) {
  const n = parseFloat(String(price))
  if (currency === 'RUB') return `${n.toLocaleString('ru-RU')} ₽`
  if (currency === 'USD') return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  if (currency === 'EUR') return `€${n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  return `${n.toLocaleString()} ${currency}`
}

// ── Live auctions for ticker ────────────────────────────────────────────────────
const liveAuctions = computed(() =>
  store.listings.filter(l =>
    (l.listing_kind === 'auction' || l.listing_kind === 'ych') &&
    l.status === 'active' &&
    l.auction_ends_at &&
    new Date(l.auction_ends_at).getTime() > now.value
  ).slice(0, 6)
)



// ── Create modal ───────────────────────────────────────────────────────────────
const showCreateModal = ref(false)
const isCreating      = ref(false)
const createError     = ref('')
const form = ref({
  title: '', description: '', price: 0, currency: 'USD',
  category: 'art' as any, type: 'digital' as any, listingKind: 'fixed' as ListingKind,
  images: [] as string[], quantity: 1, isNsfw: false, tags: '', status: 'active' as any,
  auctionEndsAt: '', bidIncrement: 5, autoBuyPrice: 0, raffleMaxTickets: 0,
})

function resetForm() {
  form.value = {
    title: '', description: '', price: 0, currency: 'USD',
    category: 'art', type: 'digital', listingKind: 'fixed',
    images: [], quantity: 1, isNsfw: false, tags: '', status: 'active',
    auctionEndsAt: '', bidIncrement: 5, autoBuyPrice: 0, raffleMaxTickets: 0,
  }
}

function isFormDirty() { return form.value.title.trim() !== '' || form.value.description.trim() !== '' }

function openCreateModal() {
  if (!auth.user) { router.push({ name: 'login' }); return }
  if (!canSell.value) return
  resetForm()
  showCreateModal.value = true
}
async function tryCloseCreate() {
  if (isFormDirty() && !(await confirmDialog(langStore.t.dealersDenUnsavedCloseConfirm))) return
  showCreateModal.value = false
}
async function submitCreate() {
  if (!form.value.title.trim()) return
  isCreating.value = true
  createError.value = ''
  try {
    await store.createListing({
      title: form.value.title, description: form.value.description || undefined,
      price: form.value.price, currency: form.value.currency,
      category: form.value.category, type: form.value.type,
      listingKind: form.value.listingKind, images: form.value.images,
      quantity: form.value.quantity, isNsfw: form.value.isNsfw,
      tags: form.value.tags.split(',').map(t => t.trim()).filter(Boolean),
      status: form.value.status,
      auctionEndsAt:    form.value.auctionEndsAt   || undefined,
      bidIncrement:     form.value.bidIncrement     || 1,
      autoBuyPrice:     form.value.autoBuyPrice     || undefined,
      raffleMaxTickets: form.value.raffleMaxTickets || undefined,
    })
    showCreateModal.value = false
  } catch (err: any) {
    createError.value = err?.response?.data?.message ?? err?.response?.data?.error ?? langStore.t.dealersDenCreateFailed
  } finally { isCreating.value = false }
}

// ── Edit modal ─────────────────────────────────────────────────────────────────
const showEditModal = ref(false)
const isUpdating    = ref(false)
const editError     = ref('')
const editingId     = ref('')
const editForm      = ref({ title: '', description: '', price: 0, currency: 'USD', quantity: 1, status: 'active' as any })

function openEdit(listing: DealerListing) {
  editingId.value = listing.id
  editForm.value  = {
    title: listing.title, description: listing.description ?? '',
    price: parseFloat(String(listing.price)), currency: listing.currency,
    quantity: listing.quantity, status: listing.status,
  }
  showEditModal.value = true
}
async function tryCloseEdit() {
  if (!(await confirmDialog(langStore.t.dealersDenUnsavedCloseConfirmShort))) return
  showEditModal.value = false
}
async function submitEdit() {
  isUpdating.value = true
  editError.value = ''
  try {
    await store.updateListing(editingId.value, {
      title: editForm.value.title, description: editForm.value.description,
      price: editForm.value.price, currency: editForm.value.currency,
      quantity: editForm.value.quantity,
    })
    showEditModal.value = false
  } catch (err: any) {
    editError.value = err?.response?.data?.message ?? err?.response?.data?.error ?? langStore.t.dealersDenSaveChangesFailed
  } finally { isUpdating.value = false }
}
async function deleteListing(id: string) {
  if (!(await confirmDialog(langStore.t.dealersDenDeleteListingConfirm, { danger: true }))) return
  try {
    await store.deleteListing(id)
  } catch (err: any) {
    alert(err?.response?.data?.error ?? langStore.t.dealersDenDeleteFailed)
  }
}

// ── Bid modal ──────────────────────────────────────────────────────────────────
const showBidModal  = ref(false)
const bidListing    = ref<DealerListing | null>(null)
const bidAmount     = ref(0)
const bidMessage    = ref('')
const isBidding     = ref(false)
const bidError      = ref('')

function openBidModal(listing: DealerListing, e: Event) {
  e.stopPropagation()
  if (!auth.user) { router.push({ name: 'login' }); return }
  bidListing.value   = listing
  const current      = parseFloat(String(listing.current_bid ?? listing.price))
  const step         = parseFloat(String(listing.bid_increment ?? 1))
  bidAmount.value    = current + step
  bidMessage.value   = ''; bidError.value = ''
  showBidModal.value = true
}
async function submitBid() {
  if (!bidListing.value) return
  isBidding.value = true; bidError.value = ''
  try {
    await store.placeBid(bidListing.value.id, bidAmount.value, bidMessage.value || undefined)
    showBidModal.value = false
  } catch (err: any) {
    bidError.value = err?.response?.data?.message ?? err?.response?.data?.error ?? langStore.t.dealersDenGenericRetryError
  } finally { isBidding.value = false }
}
async function submitRaffleTicket(listing: DealerListing, e: Event) {
  e.stopPropagation()
  if (!auth.user) { router.push({ name: 'login' }); return }
  if (!(await confirmDialog(langStore.t.dealersDenBuyTicketConfirm + ' ' + formatPrice(listing.price, listing.currency) + '?'))) return
  await store.buyRaffleTicket(listing.id)
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <!-- ─── Main ──────────────────────────────────────────────────────── -->
      <main class="flex-1 min-w-0 pb-28 md:pb-20 space-y-5">

        <!-- Загрузка страницы (top progress bar) -->
        <Teleport to="body">
          <transition name="fade-bar">
            <div v-if="store.isLoading"
              class="fixed top-0 left-0 right-0 z-[9999] h-0.5 overflow-hidden"
              style="background: transparent">
              <div class="h-full animate-loading-bar"
                style="background: linear-gradient(90deg, #3148FF, #4C67CF, #FFC01F, #4C67CF, #3148FF); background-size: 200%"></div>
            </div>
          </transition>
        </Teleport>

        <!-- ═══════════════════════════════════════════
             HERO — gradient mesh + blobs + stats
        ════════════════════════════════════════════ -->
        <div class="relative overflow-hidden rounded-3xl shadow-2xl" style="min-height:190px">
          <!-- Gradient mesh -->
          <div class="absolute inset-0" style="background: linear-gradient(135deg, #071a3e 0%, #0f0f20 45%, #091a30 100%)" />
          <!-- Blobs -->
          <div class="absolute -top-8 -left-8 w-64 h-64 rounded-full opacity-35 blur-3xl" style="background: radial-gradient(circle, #3148FF, transparent)" />
          <div class="absolute -bottom-8 right-16 w-56 h-56 rounded-full opacity-30 blur-3xl" style="background: radial-gradient(circle, #4C67CF, transparent)" />
          <div class="absolute top-4 right-4 w-36 h-36 rounded-full opacity-20 blur-2xl" style="background: radial-gradient(circle, #FFC01F, transparent)" />

          <!-- Floating decorative chips -->
          <div class="absolute top-3 right-12 rotate-12 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-1.5 hidden md:flex items-center gap-1.5">
            <BIcon name="Hammer" class="w-3.5 h-3.5 text-brand-yellow" /><span class="text-white text-xs font-bold">{{ langStore.t.dealersDenKindAuction }}</span>
          </div>
          <div class="absolute bottom-4 right-6 -rotate-6 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-1.5 hidden md:flex items-center gap-1.5">
            <BIcon name="Paintbrush" class="w-3.5 h-3.5 text-brand-purple" /><span class="text-white text-xs font-bold">YCH</span>
          </div>
          <div class="absolute top-10 right-44 rotate-2 bg-brand-accent/20 backdrop-blur-sm border border-brand-accent/30 rounded-xl px-3 py-1.5 hidden xl:flex items-center gap-1.5">
            <BIcon name="Gift" class="w-3.5 h-3.5 text-brand-success" /><span class="text-white text-xs font-bold">{{ langStore.t.dealersDenKindRaffle }}</span>
          </div>

          <div class="relative z-10 px-6 py-7 md:px-8">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0" style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                    <BIcon name="Store" class="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 class="text-3xl font-black tracking-tight" style="background: linear-gradient(90deg, #fff 30%, #93b4ff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text">
                      Dealers' Den
                    </h1>
                    <p class="text-white/50 text-xs mt-0.5 font-medium">
                      {{ store.isLoading ? '…' : `${store.listings.length} ${langStore.t.dealersDenListingsCountLabel}` }} &nbsp;·&nbsp; {{ langStore.t.dealersDenMarketplaceTagline }}
                    </p>
                  </div>
                </div>
                <p class="text-white/70 text-sm max-w-md leading-relaxed">
                  {{ langStore.t.dealersDenHeroArts }}, <span class="text-brand-yellow font-semibold">{{ langStore.t.dealersDenHeroAuctions }}</span>,
                  <span class="text-brand-purple font-semibold">YCH</span>,
                  <span class="text-brand-success font-semibold">{{ langStore.t.dealersDenHeroRaffles }}</span> {{ langStore.t.dealersDenHeroConnector }}
                  <span class="text-brand-accent font-semibold">Bloomly</span>.
                </p>
              </div>

              <!-- Search + CTA -->
              <div class="flex flex-col gap-2 min-w-[220px]">
                <div class="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl px-4 py-2.5">
                  <BIcon name="Search" class="w-4 h-4 text-white/50 shrink-0" />
                  <input v-model="searchQuery" :placeholder="langStore.t.dealersDenSearchPlaceholderHero"
                    @keyup.enter="applyFilter()"
                    class="bg-transparent text-sm text-white placeholder-white/35 outline-none w-full" />
                </div>
                <button v-if="auth.user" @click="activeTab = auth.user ? (activeTab === 'my' ? 'browse' : 'my') : 'browse'"
                  class="flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-bold rounded-2xl transition-all"
                  :style="activeTab === 'my' ? 'background: linear-gradient(135deg, #3148FF, #4C67CF)' : 'background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12)'">
                  <BIcon :name="activeTab === 'my' ? 'ShoppingBag' : 'ClipboardList'" class="w-4 h-4" />
                  {{ activeTab === 'my' ? langStore.t.dealersDenMarketplaceLabel : langStore.t.dealersDenMyListingsLabel }}
                </button>
              </div>
            </div>

            <!-- Stats row -->
            <div class="flex gap-3 mt-5 flex-wrap">
              <div v-for="stat in [
                { icon: 'ShoppingBag',  label: langStore.t.dealersDenListingsStatLabel, value: store.listings.length },
                { icon: 'Hammer',       label: langStore.t.dealersDenStatAuctions,  value: store.listings.filter(l => l.listing_kind === 'auction' || l.listing_kind === 'ych').length },
                { icon: 'Gift',         label: langStore.t.dealersDenStatRaffles, value: store.listings.filter(l => l.listing_kind === 'raffle').length },
                { icon: 'ListOrdered',  label: langStore.t.dealersDenStatCommissions,   value: store.listings.filter(l => l.listing_kind === 'commission_queue').length },
              ]" :key="stat.label"
                class="flex items-center gap-2 bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl px-4 py-2">
                <BIcon :name="stat.icon" class="w-3.5 h-3.5 text-brand-accent" />
                <span class="text-white font-extrabold text-sm">{{ stat.value }}</span>
                <span class="text-white/45 text-xs">{{ stat.label }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════
             PROMO TILES (только на browse)
        ════════════════════════════════════════════ -->
        <div v-if="activeTab === 'browse'" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div v-for="tile in [
            { icon: 'Hammer',      label: langStore.t.dealersDenLabelAuctions,  sub: langStore.t.dealersDenPromoAuctionsSub, kind: 'auction',          from: '#FFC01F', to: '#E76F51' },
            { icon: 'Paintbrush',  label: 'YCH',        sub: langStore.t.dealersDenPromoYchSub,     kind: 'ych',              from: '#CD83F5', to: '#7C3AED' },
            { icon: 'Gift',        label: langStore.t.dealersDenLabelRaffles,  sub: langStore.t.dealersDenPromoRaffleSub, kind: 'raffle',           from: '#66C770', to: '#059669' },
            { icon: 'ListOrdered', label: langStore.t.dealersDenKindCommissions,   sub: langStore.t.dealersDenPromoCommissionSub,    kind: 'commission_queue', from: '#a78bfa', to: '#7c3aed' },
          ]" :key="tile.kind"
            @click="selectKind(tile.kind)"
            class="relative overflow-hidden rounded-2xl cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
            :class="selectedKind === tile.kind ? 'ring-2 ring-white/30' : ''"
            style="height:72px">
            <div class="absolute inset-0" :style="`background: linear-gradient(135deg, ${tile.from}cc, ${tile.to}cc)`" />
            <div class="relative z-10 h-full flex items-center gap-2.5 px-3">
              <BIcon :name="tile.icon" class="w-5 h-5 text-white/90 flex-shrink-0" />
              <div>
                <p class="text-white font-bold text-xs leading-tight">{{ tile.label }}</p>
                <p class="text-white/55 text-[10px]">{{ tile.sub }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════
             KIND + CATEGORY FILTER PILLS
        ════════════════════════════════════════════ -->
        <div class="flex flex-col gap-2.5">
          <!-- Kind pills -->
          <div class="flex items-center gap-2 flex-wrap">
            <button v-for="k in KINDS" :key="k.key"
              @click="selectKind(k.key)"
              class="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap"
              :class="selectedKind === k.key
                ? 'text-white shadow-md shadow-brand-accent/25'
                : 'bg-brand-card border border-brand-border text-white/65 hover:text-white hover:border-white/20'"
              :style="selectedKind === k.key ? 'background: linear-gradient(135deg, #3148FF, #4C67CF)' : ''">
              <BIcon :name="k.icon" class="w-3.5 h-3.5" />
              {{ k.label }}
            </button>

            <div class="flex gap-1.5 ml-auto flex-shrink-0">
              <button v-if="auth.user && canSell" @click="openCreateModal"
                class="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-bold rounded-full transition-all shadow-md"
                style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                <BIcon name="Plus" class="w-3.5 h-3.5" /> {{ langStore.t.dealersDenPostBtn }}
              </button>
            </div>
          </div>

          <!-- Category pills row -->
          <div class="flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
            <button v-for="cat in CATS" :key="cat.key"
              @click="selectCategory(cat.key)"
              class="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap border"
              :class="selectedCategory === cat.key
                ? 'bg-brand-accent/20 border-brand-accent text-brand-accent'
                : 'bg-brand-card border-brand-border text-white/50 hover:text-white hover:border-white/20'">
              <BIcon :name="cat.icon" class="w-3 h-3" />
              {{ cat.label }}
            </button>
          </div>

          <!-- Search + sort row -->
          <div class="flex gap-2 items-center">
            <div class="relative flex-1">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input v-model="searchQuery" @input="onSearchInput"
                :placeholder="langStore.t.dealersDenSearchPlaceholder"
                class="w-full bg-brand-card border border-brand-border rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-brand-accent/50 transition-all" />
            </div>
            <select v-model="selectedSort"
              class="bg-brand-card border border-brand-border rounded-full px-3.5 py-2 text-sm text-white/60 outline-none transition-all appearance-none cursor-pointer flex-shrink-0">
              <option v-for="s in SORTS" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
            <div class="flex gap-1 flex-shrink-0">
              <button v-for="t in [{ v: '', l: 'Globe', title: langStore.t.tabAll }, { v: 'digital', l: 'Download', title: langStore.t.dealersDenTypeDigital }, { v: 'physical', l: 'Package', title: langStore.t.dealersDenTypePhysical }]" :key="t.v"
                @click="selectedType = t.v as any; applyFilter()"
                :title="t.title"
                class="w-8 h-8 rounded-full text-sm transition-all border flex items-center justify-center"
                :class="selectedType === t.v
                  ? 'bg-brand-accent/20 border-brand-accent text-brand-accent'
                  : 'bg-brand-card border-brand-border text-white/40 hover:text-white hover:border-white/20'">
                <BIcon :name="t.l" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════
             LIVE AUCTIONS — горизонтальный скролл
        ════════════════════════════════════════════ -->
        <div v-if="liveAuctions.length > 0 && selectedKind === '' && activeTab === 'browse'" class="space-y-3">
          <h2 class="text-sm font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-brand-error animate-pulse inline-block" />
            <BIcon name="Flame" class="w-4 h-4 text-brand-yellow" />
            Live · {{ langStore.t.dealersDenLabelAuctions }}
          </h2>
          <div class="flex gap-3 overflow-x-auto scrollbar-none pb-1">
            <div v-for="listing in liveAuctions" :key="listing.id"
              @click="openListing(listing)"
              class="flex-shrink-0 w-44 bg-brand-card border border-brand-yellow/20 rounded-2xl overflow-hidden cursor-pointer group hover:border-brand-yellow/50 transition-all shadow-lg hover:shadow-brand-yellow/10 hover:-translate-y-0.5">
              <div class="relative h-28 bg-brand-bg overflow-hidden">
                <img v-if="listing.images[0]" :src="listing.images[0]" :alt="listing.title"
                  class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div v-else class="w-full h-full flex items-center justify-center bg-brand-bg">
                  <BIcon name="Hammer" class="w-10 h-10 text-brand-yellow/30" />
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                <div class="absolute bottom-2 inset-x-2 flex items-end justify-between">
                  <span class="text-[10px] font-extrabold text-brand-yellow leading-none">
                    {{ formatPrice(listing.current_bid ?? listing.price, listing.currency) }}
                  </span>
                  <span class="text-[9px] font-bold tabular-nums"
                    :class="isAuctionHot(listing.auction_ends_at) ? 'text-brand-error' : 'text-white/60'">
                    {{ formatCountdown(listing.auction_ends_at) }}
                  </span>
                </div>
              </div>
              <div class="p-2.5">
                <p class="text-white text-xs font-bold line-clamp-1">{{ listing.title }}</p>
                <p class="text-white/40 text-[10px] mt-0.5 truncate">
                  {{ listing.seller.display_name ?? listing.seller.username }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════
             Section header
        ════════════════════════════════════════════ -->
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
            <BIcon name="LayoutGrid" class="w-4 h-4 text-brand-accent" />
            {{ activeTab === 'my' ? langStore.t.dealersDenMyListingsLabel : selectedKind ? (KINDS.find(k => k.key === selectedKind)?.label ?? langStore.t.dealersDenCatalogFallback) : langStore.t.dealersDenAllListingsLabel }}
          </h2>
          <span class="text-xs text-white/35 font-medium">{{ displayListings.length }} {{ langStore.t.dealersDenPiecesAbbr }}</span>
        </div>

        <!-- ═══════════════════════════════════════════
             LISTINGS GRID
        ════════════════════════════════════════════ -->

        <!-- Skeleton -->
        <div v-if="store.isLoading" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div v-for="n in 8" :key="n" class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden animate-pulse">
            <div class="w-full aspect-square bg-brand-border" />
            <div class="p-3 space-y-1.5">
              <div class="h-3.5 bg-brand-border rounded-full w-3/4" />
              <div class="h-3 bg-brand-border rounded-full w-1/2" />
            </div>
          </div>
        </div>

        <!-- Empty -->
        <div v-else-if="displayListings.length === 0"
          class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
          <div class="w-20 h-20 bg-brand-bg rounded-full flex items-center justify-center mx-auto mb-5">
            <BIcon name="ShoppingBag" class="w-10 h-10 text-white/20" />
          </div>
          <h3 class="text-lg font-bold text-white mb-2">
            {{ activeTab === 'my' ? langStore.t.dealersDenNoListings : langStore.t.dealersDenNothingFound }}
          </h3>
          <p class="text-white/35 text-sm mb-6">
            {{ activeTab === 'my' ? langStore.t.dealersDenPostFirstHint : langStore.t.dealersDenTryOtherFilterHint }}
          </p>
          <button v-if="activeTab === 'my' && canSell"
            @click="openCreateModal"
            class="inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-2xl transition-all hover:opacity-90"
            style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
            <BIcon name="Plus" class="w-4 h-4" /> {{ langStore.t.dealersDenCreateListingBtn }}
          </button>
        </div>

        <!-- Grid -->
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div v-for="listing in displayListings" :key="listing.id"
            class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:border-brand-accent/50 hover:-translate-y-0.5 transition-all cursor-pointer group shadow-lg hover:shadow-brand-accent/10"
            @click="openListing(listing)">

            <!-- Image -->
            <div class="relative w-full overflow-hidden bg-brand-bg" style="aspect-ratio: 4/3">
              <img v-if="listing.images[0]" :src="listing.images[0]" :alt="listing.title"
                class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
              <div v-else class="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-bg to-brand-border">
                <BIcon name="Image" class="w-12 h-12 text-white/8" />
              </div>

              <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

              <!-- Sold overlay -->
              <div v-if="isSoldOut(listing)" class="absolute inset-0 bg-black/65 flex items-center justify-center">
                <span class="bg-brand-error text-white text-xs font-extrabold px-4 py-1.5 rounded-full tracking-wide">{{ langStore.t.dealersDenSoldBadge }}</span>
              </div>
              <!-- NSFW блюр (если режим не включён) -->
              <div
                v-else-if="listing.is_nsfw && !nsfwEnabled"
                class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 cursor-pointer"
                style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); background: rgba(0,0,0,0.45)"
                @click.stop="showNsfwConfirm = true">
                <span class="text-3xl select-none">🔞</span>
                <span class="text-[10px] font-extrabold text-white bg-rose-600/90 px-3 py-1 rounded-full tracking-wide">{{ langStore.t.dealersDenNsfwTapToView }}</span>
              </div>

              <!-- Kind badge top-left -->
              <div class="absolute top-2 left-2">
                <span :class="[KIND_META[listing.listing_kind ?? 'fixed']?.color, KIND_META[listing.listing_kind ?? 'fixed']?.border, KIND_META[listing.listing_kind ?? 'fixed']?.bg]"
                  class="inline-flex items-center gap-1 border text-[9px] font-extrabold px-2 py-0.5 rounded-full backdrop-blur-sm">
                  <BIcon :name="KIND_META[listing.listing_kind ?? 'fixed']?.icon" class="w-2.5 h-2.5" />
                  {{ KIND_META[listing.listing_kind ?? 'fixed']?.label }}
                </span>
              </div>

              <!-- Type badge top-right -->
              <div class="absolute top-2 right-2">
                <span v-if="listing.type !== 'physical'"
                  class="text-[9px] font-extrabold px-2 py-0.5 rounded-full backdrop-blur-sm"
                  :class="listing.type === 'digital' ? 'bg-brand-accent/90 text-white' : 'bg-brand-yellow/90 text-black'">
                  {{ listing.type === 'digital' ? langStore.t.dealersDenTypeDigital : langStore.t.dealersDenTypeBoth }}
                </span>
              </div>

              <!-- Draft chip -->
              <div v-if="listing.status === 'draft'" class="absolute bottom-2 left-2">
                <span class="inline-flex items-center gap-1 bg-white/15 backdrop-blur-sm text-white/80 text-[9px] font-bold px-2 py-0.5 rounded-full">
                  <BIcon name="Pencil" class="w-2.5 h-2.5" /> {{ langStore.t.dealersDenDraftBadge }}
                </span>
              </div>

              <!-- Auction countdown bottom-right -->
              <div v-if="(listing.listing_kind === 'auction' || listing.listing_kind === 'ych') && !isSoldOut(listing)" class="absolute bottom-2 right-2">
                <span class="text-[9px] font-extrabold tabular-nums px-2 py-0.5 rounded-full backdrop-blur-sm"
                  :class="isAuctionHot(listing.auction_ends_at) ? 'bg-brand-error/90 text-white' : 'bg-black/60 text-white/80'">
                  {{ formatCountdown(listing.auction_ends_at) || '—' }}
                </span>
              </div>

              <!-- My controls -->
              <div v-if="activeTab === 'my'" class="absolute bottom-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
                <button @click="openEdit(listing)"
                  class="w-7 h-7 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-brand-accent transition-all">
                  <BIcon name="Pencil" class="w-3.5 h-3.5 text-white" />
                </button>
                <button @click="deleteListing(listing.id)"
                  class="w-7 h-7 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-brand-error transition-all">
                  <BIcon name="Trash2" class="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>

            <!-- ══ Info bar (per-kind) ══════════════════════════════════ -->

            <!-- ── AUCTION ── -->
            <div v-if="listing.listing_kind === 'auction'" class="flex flex-col">
              <div class="px-3 pt-2.5 pb-1.5">
                <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ listing.title }}</h3>
                <div class="flex items-center gap-1 mt-0.5">
                  <img v-if="listing.seller.avatar_url" :src="listing.seller.avatar_url"
                    class="w-4 h-4 rounded-full object-cover flex-shrink-0 border border-brand-yellow/20" />
                  <div v-else class="w-4 h-4 rounded-full bg-brand-yellow/15 flex items-center justify-center flex-shrink-0 text-[7px] text-brand-yellow font-extrabold border border-brand-yellow/20">
                    {{ (listing.seller.display_name ?? listing.seller.username)[0].toUpperCase() }}
                  </div>
                  <span class="text-[10px] text-brand-yellow/80 truncate font-medium">{{ listing.seller.display_name ?? listing.seller.username }}</span>
                  <BIcon v-if="listing.seller.is_verified" name="BadgeCheck" class="w-2.5 h-2.5 text-brand-accent flex-shrink-0" :title="langStore.t.verBadgeGenericLabel" />
                </div>
              </div>
              <!-- Auction live panel -->
              <div class="mx-2 mb-2 rounded-xl overflow-hidden" style="background: linear-gradient(135deg, rgba(255,192,31,0.08), rgba(231,111,81,0.06)); border: 1px solid rgba(255,192,31,0.2)">
                <div class="px-2.5 py-2 flex items-center justify-between">
                  <div>
                    <p class="text-[8px] text-white/35 uppercase tracking-wider leading-none mb-0.5">{{ langStore.t.dealersDenCurrentBid }}</p>
                    <p class="text-sm font-black text-brand-yellow tabular-nums leading-none">{{ formatPrice(listing.current_bid ?? listing.price, listing.currency) }}</p>
                    <p class="text-[8px] text-white/30 mt-0.5">{{ listing.bid_count ?? 0 }} {{ langStore.t.dealersDenBidsCountSuffix }}</p>
                  </div>
                  <div class="flex flex-col items-end gap-1.5">
                    <span class="text-[9px] font-extrabold tabular-nums leading-none"
                      :class="isAuctionHot(listing.auction_ends_at) ? 'text-brand-error' : 'text-white/50'">
                      {{ formatCountdown(listing.auction_ends_at) || '—' }}
                    </span>
                    <button v-if="!isSoldOut(listing)" @click.stop="openBidModal(listing, $event)"
                      class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-extrabold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
                      style="background: linear-gradient(135deg, #FFC01F, #E76F51)">
                      <BIcon name="Hammer" class="w-3 h-3" /> {{ langStore.t.dealersDenBidWord }}
                    </button>
                    <span v-else class="text-[9px] font-bold text-brand-error/70">{{ langStore.t.dealersDenAuctionEnded }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── YCH ── -->
            <div v-else-if="listing.listing_kind === 'ych'" class="flex flex-col">
              <div class="px-3 pt-2.5 pb-1.5">
                <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ listing.title }}</h3>
                <div class="flex items-center gap-1 mt-0.5">
                  <img v-if="listing.seller.avatar_url" :src="listing.seller.avatar_url"
                    class="w-4 h-4 rounded-full object-cover flex-shrink-0 border border-brand-purple/20" />
                  <div v-else class="w-4 h-4 rounded-full bg-brand-purple/15 flex items-center justify-center flex-shrink-0 text-[7px] text-brand-purple font-extrabold border border-brand-purple/20">
                    {{ (listing.seller.display_name ?? listing.seller.username)[0].toUpperCase() }}
                  </div>
                  <span class="text-[10px] text-brand-purple/90 truncate font-medium">{{ listing.seller.display_name ?? listing.seller.username }}</span>
                  <BIcon v-if="listing.seller.is_verified" name="BadgeCheck" class="w-2.5 h-2.5 text-brand-accent flex-shrink-0" :title="langStore.t.verBadgeGenericLabel" />
                </div>
              </div>
              <!-- YCH slot panel -->
              <div class="mx-2 mb-2 rounded-xl overflow-hidden" style="background: linear-gradient(135deg, rgba(205,131,245,0.08), rgba(124,58,237,0.06)); border: 1px solid rgba(205,131,245,0.2)">
                <div class="px-2.5 py-2">
                  <!-- Slot squares row -->
                  <div class="flex items-center gap-1 mb-1.5">
                    <template v-for="s in Math.max(listing.quantity ?? 1, 1)" :key="s">
                      <div class="w-3.5 h-3.5 rounded-sm flex-shrink-0 transition-all"
                        :style="s <= (listing.quantity_sold ?? 0)
                          ? 'background: rgba(205,131,245,0.20); border: 1px solid rgba(205,131,245,0.15)'
                          : 'background: linear-gradient(135deg, #CD83F5, #7C3AED); box-shadow: 0 0 4px rgba(205,131,245,0.4)'" />
                    </template>
                    <span class="text-[9px] text-white/35 ml-1 font-medium tabular-nums">
                      {{ (listing.quantity ?? 1) - (listing.quantity_sold ?? 0) }} / {{ listing.quantity ?? 1 }}
                    </span>
                  </div>
                  <div class="flex items-center justify-between gap-1">
                    <div>
                      <p class="text-[8px] text-white/35 uppercase tracking-wider leading-none mb-0.5">{{ langStore.t.dealersDenBidWord }}</p>
                      <p class="text-xs font-black text-brand-purple tabular-nums leading-none">{{ formatPrice(listing.current_bid ?? listing.price, listing.currency) }}</p>
                      <p v-if="listing.auto_buy_price" class="text-[8px] text-brand-yellow/70 mt-0.5 font-bold">AB: {{ formatPrice(listing.auto_buy_price, listing.currency) }}</p>
                    </div>
                    <button v-if="!isSoldOut(listing)" @click.stop="openBidModal(listing, $event)"
                      class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-extrabold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
                      style="background: linear-gradient(135deg, #CD83F5, #7C3AED)">
                      <BIcon name="Paintbrush" class="w-3 h-3" /> {{ langStore.t.dealersDenSlotBtn }}
                    </button>
                    <span v-else class="text-[9px] font-bold text-brand-error/70">{{ langStore.t.dealersDenAllTaken }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── RAFFLE ── -->
            <div v-else-if="listing.listing_kind === 'raffle'" class="flex flex-col">
              <div class="px-3 pt-2.5 pb-1.5">
                <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ listing.title }}</h3>
                <div class="flex items-center gap-1 mt-0.5">
                  <img v-if="listing.seller.avatar_url" :src="listing.seller.avatar_url"
                    class="w-4 h-4 rounded-full object-cover flex-shrink-0 border border-brand-success/20" />
                  <div v-else class="w-4 h-4 rounded-full bg-brand-success/15 flex items-center justify-center flex-shrink-0 text-[7px] text-brand-success font-extrabold border border-brand-success/20">
                    {{ (listing.seller.display_name ?? listing.seller.username)[0].toUpperCase() }}
                  </div>
                  <span class="text-[10px] text-brand-success/80 truncate font-medium">{{ listing.seller.display_name ?? listing.seller.username }}</span>
                  <BIcon v-if="listing.seller.is_verified" name="BadgeCheck" class="w-2.5 h-2.5 text-brand-accent flex-shrink-0" :title="langStore.t.verBadgeGenericLabel" />
                </div>
              </div>
              <!-- Raffle ticket panel -->
              <div class="mx-2 mb-2 rounded-xl overflow-hidden" style="background: linear-gradient(135deg, rgba(102,199,112,0.08), rgba(5,150,105,0.06)); border: 1px solid rgba(102,199,112,0.2)">
                <div class="px-2.5 py-2">
                  <!-- Progress bar -->
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[8px] text-white/35 uppercase tracking-wider">
                      {{ listing.raffle_tickets_sold ?? 0 }}{{ listing.raffle_max_tickets ? ` / ${listing.raffle_max_tickets}` : '' }} {{ langStore.t.dealersDenTicketsSuffix }}
                    </span>
                    <span v-if="listing.raffle_max_tickets" class="text-[8px] font-bold text-brand-success">
                      {{ Math.round(((listing.raffle_tickets_sold ?? 0) / listing.raffle_max_tickets) * 100) }}%
                    </span>
                  </div>
                  <div class="w-full h-1.5 bg-black/30 rounded-full overflow-hidden mb-2">
                    <div class="h-full rounded-full transition-all duration-700"
                      style="background: linear-gradient(90deg, #66C770, #059669)"
                      :style="`width: ${listing.raffle_max_tickets ? Math.min(100, ((listing.raffle_tickets_sold ?? 0) / listing.raffle_max_tickets) * 100) : Math.min(100, (listing.raffle_tickets_sold ?? 0) * 5)}%`" />
                  </div>
                  <!-- Milestones dots (purely decorative) -->
                  <div class="flex gap-1 mb-2">
                    <div v-for="m in 5" :key="m"
                      class="h-1 flex-1 rounded-full transition-all"
                      :style="m * 20 <= (listing.raffle_max_tickets ? Math.round(((listing.raffle_tickets_sold ?? 0) / listing.raffle_max_tickets) * 100) : 0)
                        ? 'background: rgba(102,199,112,0.6)'
                        : 'background: rgba(255,255,255,0.08)'" />
                  </div>
                  <div class="flex items-center justify-between gap-1">
                    <p class="text-xs font-black text-brand-success tabular-nums">{{ formatPrice(listing.price, listing.currency) }}<span class="text-[8px] text-white/30 font-normal">/{{ langStore.t.dealersDenPiecesAbbr }}</span></p>
                    <button v-if="!isSoldOut(listing)" @click.stop="submitRaffleTicket(listing, $event)"
                      class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-extrabold text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
                      style="background: linear-gradient(135deg, #66C770, #059669)">
                      <BIcon name="Ticket" class="w-3 h-3" /> {{ langStore.t.dealersDenTicketBtn }}
                    </button>
                    <span v-else class="text-[9px] font-bold text-brand-success/60">{{ langStore.t.dealersDenRaffleDrawn }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- ── FIXED (default) ── -->
            <div v-else class="p-3">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ listing.title }}</h3>
                  <div class="flex items-center gap-1 mt-0.5">
                    <img v-if="listing.seller.avatar_url" :src="listing.seller.avatar_url"
                      class="w-4 h-4 rounded-full object-cover flex-shrink-0 border border-brand-accent/20" />
                    <div v-else class="w-4 h-4 rounded-full bg-brand-accent/15 flex items-center justify-center flex-shrink-0 text-[7px] text-brand-accent font-extrabold border border-brand-accent/20">
                      {{ (listing.seller.display_name ?? listing.seller.username)[0].toUpperCase() }}
                    </div>
                    <span class="text-[10px] text-brand-accent/80 truncate font-medium">{{ listing.seller.display_name ?? listing.seller.username }}</span>
                    <BIcon v-if="listing.seller.is_verified" name="BadgeCheck" class="w-2.5 h-2.5 text-brand-accent flex-shrink-0" :title="langStore.t.verBadgeGenericLabel" />
                  </div>
                </div>
                <div class="flex-shrink-0 flex flex-col items-end gap-0.5" @click.stop>
                  <template v-if="isSoldOut(listing)">
                    <span class="text-[10px] font-bold text-white/30 line-through">{{ formatPrice(listing.price, listing.currency) }}</span>
                    <span class="text-[9px] font-bold text-brand-error/60">{{ langStore.t.dealersDenOutOfStock }}</span>
                  </template>
                  <template v-else>
                    <span class="text-sm font-black text-brand-yellow tabular-nums">{{ formatPrice(listing.price, listing.currency) }}</span>
                    <span v-if="listing.quantity > 1" class="text-[9px] text-brand-success/80 font-medium tabular-nums">
                      <BIcon name="Package" class="w-2.5 h-2.5 inline" /> {{ listing.quantity - (listing.quantity_sold ?? 0) }} {{ langStore.t.dealersDenPiecesAbbr }}
                    </span>
                    <span v-else-if="listing.price === 0" class="text-[9px] font-bold text-brand-success">{{ langStore.t.subFree }}</span>
                  </template>
                </div>
              </div>
            </div>

            <!-- Hashtags — shared across every kind's info bar above -->
            <div v-if="listing.tags?.length" class="px-3 pb-2.5 flex flex-wrap gap-1" @click.stop>
              <button v-for="tag in listing.tags.slice(0, 4)" :key="tag" @click="filterByTag(tag)"
                class="text-[9px] font-bold text-brand-accent/80 bg-brand-accent/8 hover:bg-brand-accent/15 px-2 py-0.5 rounded-full transition-colors">
                #{{ tag }}
              </button>
            </div>
          </div>
        </div>

      </main>

      <!-- ─── Right sidebar ─────────────────────────────────────────────── -->
      <aside class="w-52 hidden xl:flex flex-col gap-4 sticky top-24 self-start flex-shrink-0">

        <!-- Create button / requirements -->
        <div v-if="auth.user">
          <button v-if="canSell" @click="openCreateModal"
            class="w-full flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-2xl transition-all shadow-lg hover:opacity-90"
            style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
            <BIcon name="Plus" class="w-4 h-4" /> {{ langStore.t.dealersDenPostItemBtn }}
          </button>
          <div v-else class="bg-brand-card border border-brand-border rounded-2xl p-3.5 space-y-3">
            <div class="flex items-center gap-2.5">
              <div class="w-7 h-7 rounded-xl bg-brand-bg flex items-center justify-center">
                <BIcon name="Lock" class="w-3.5 h-3.5 text-white/30" />
              </div>
              <p class="text-xs font-bold text-white/50">{{ langStore.t.dealersDenRequirementsLabel }}</p>
            </div>
            <div class="space-y-2 text-xs">
              <div class="flex items-center gap-2">
                <BIcon :name="auth.user.is_verified ? 'CheckCircle2' : 'Circle'" class="w-4 h-4 flex-shrink-0"
                  :class="auth.user.is_verified ? 'text-brand-success' : 'text-brand-border'" />
                <span :class="auth.user.is_verified ? 'text-white/60' : 'text-white/25'">{{ langStore.t.secVerification }}</span>
              </div>
              <div class="flex items-center gap-2">
                <BIcon :name="(auth.user.verification_type === 'artist' || auth.user.verification_type === 'master') ? 'CheckCircle2' : 'Circle'" class="w-4 h-4 flex-shrink-0"
                  :class="(auth.user.verification_type === 'artist' || auth.user.verification_type === 'master') ? 'text-brand-success' : 'text-brand-border'" />
                <span :class="(auth.user.verification_type === 'artist' || auth.user.verification_type === 'master') ? 'text-white/60' : 'text-white/25'">{{ langStore.t.dealersDenArtistMasterLabel }}</span>
              </div>
            </div>
            <button @click="router.push({ name: 'settings' })"
              class="w-full text-center py-2 rounded-xl text-xs font-bold text-brand-accent bg-brand-accent/8 border border-brand-accent/20 hover:bg-brand-accent/15 transition-all">
              {{ langStore.t.dealersDenApplyBtn }}
            </button>
          </div>
        </div>
        <div v-else>
          <button @click="router.push({ name: 'login' })"
            class="w-full flex items-center justify-center gap-2 py-3 text-white/60 text-sm font-bold rounded-2xl transition-all border border-brand-border hover:border-brand-accent/40 hover:text-white">
            <BIcon name="LogIn" class="w-4 h-4" /> {{ langStore.t.dealersDenLoginToSellBtn }}
          </button>
        </div>

        <button v-if="canSellFrames" @click="showFrameModal = true"
          class="w-full flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-2xl transition-all shadow-lg hover:opacity-90 border border-brand-border bg-brand-card">
          <BIcon name="CircleDashed" class="w-4 h-4" /> {{ langStore.t.avatarFrameSubmitBtn }}
        </button>

        <!-- Trending hashtags -->
        <div v-if="trendingTags.length" class="bg-brand-card border border-brand-border rounded-2xl p-3.5 space-y-2.5">
          <h4 class="text-xs font-bold text-white/35 uppercase tracking-wider">{{ langStore.t.dealersDenTrendingTagsLabel }}</h4>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="t in trendingTags" :key="t.tag" @click="filterByTag(t.tag)"
              class="text-[10px] font-bold text-brand-accent bg-brand-accent/8 hover:bg-brand-accent/15 px-2.5 py-1 rounded-full transition-colors">
              #{{ t.tag }}
            </button>
          </div>
        </div>

        <!-- Quick filter mini-cards (like Stickers) -->
        <div class="space-y-2">
          <h4 class="text-xs font-bold text-white/35 uppercase tracking-wider px-1">{{ langStore.t.dealersDenSaleTypesLabel }}</h4>
          <div v-for="k in [
            { key: '',        icon: 'LayoutGrid', label: langStore.t.tabAll,             from: '#3148FF', to: '#4C67CF' },
            { key: 'auction', icon: 'Hammer',     label: langStore.t.dealersDenLabelAuctions, from: '#FFC01F', to: '#E76F51' },
            { key: 'ych',              icon: 'Paintbrush',  label: 'YCH',        from: '#CD83F5', to: '#7C3AED' },
            { key: 'raffle',           icon: 'Gift',        label: langStore.t.dealersDenLabelRaffles, from: '#66C770', to: '#059669' },
            { key: 'fixed',            icon: 'Tag',         label: langStore.t.dealersDenKindFixed, from: '#3148FF', to: '#2D3F9E' },
            { key: 'commission_queue', icon: 'ListOrdered', label: langStore.t.dealersDenKindCommissions, from: '#a78bfa', to: '#7c3aed' },
          ]" :key="k.key"
            @click="selectKind(k.key)"
            class="relative overflow-hidden rounded-2xl cursor-pointer hover:scale-[1.02] transition-transform"
            :class="selectedKind === k.key ? 'ring-2 ring-white/20' : ''"
            style="height:50px">
            <div class="absolute inset-0" :style="`background: linear-gradient(135deg, ${k.from}bb, ${k.to}bb)`" />
            <div class="relative z-10 h-full flex items-center gap-2.5 px-3">
              <BIcon :name="k.icon" class="w-4 h-4 text-white/90" />
              <span class="text-white font-bold text-xs">{{ k.label }}</span>
            </div>
          </div>
        </div>

        <!-- Stats card -->
        <div class="bg-brand-card border border-brand-border rounded-2xl p-4 space-y-2">
          <h4 class="text-xs font-bold text-white/35 uppercase tracking-wider mb-3">{{ langStore.t.dealersDenStatsTitle }}</h4>
          <div class="flex items-center justify-between">
            <span class="text-xs text-white/45">{{ langStore.t.dealersDenListingsStatLabel }}</span>
            <span class="text-sm font-bold text-white">{{ store.listings.length }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-xs text-white/45">{{ langStore.t.dealersDenLiveAuctionsStatLabel }}</span>
            <span class="text-sm font-bold text-brand-yellow">{{ liveAuctions.length }}</span>
          </div>
          <div v-if="auth.user" class="flex items-center justify-between">
            <span class="text-xs text-white/45">{{ langStore.t.dealersDenMineStatLabel }}</span>
            <span class="text-sm font-bold text-white">{{ store.myListings.length }}</span>
          </div>
        </div>

        <!-- Weekly Top -->
        <DenWeeklyTop />

      </aside>
    </div>

    <!-- ═══ CREATE MODAL ══════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <transition name="modal-fade">
      <div v-if="showCreateModal"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm"
        @click.self="tryCloseCreate()">
        <div class="modal-form bg-[#0e0e1c] border border-white/8 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-2xl max-h-[94vh] flex flex-col overflow-hidden">

          <div class="relative overflow-hidden flex-shrink-0">
            <div class="absolute inset-0" style="background: linear-gradient(135deg, #0b1540 0%, #07102a 100%)" />
            <div class="absolute -top-8 -right-8 w-36 h-36 rounded-full opacity-20 blur-3xl" style="background: #3148FF" />
            <div class="absolute -bottom-4 left-6 w-24 h-24 rounded-full opacity-15 blur-2xl" style="background: #4C67CF" />
            <div class="relative z-10 px-6 pt-5 pb-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg" style="background: linear-gradient(135deg, #3148FF, #4C67CF)">
                  <BIcon name="ShoppingBag" class="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 class="text-lg font-black text-white">{{ langStore.t.dealersDenNewListingTitle }}</h2>
                  <p class="text-xs text-white/35 mt-0.5">Dealers' Den · Bloomly</p>
                </div>
              </div>
              <button @click="tryCloseCreate()" class="w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-all">
                <BIcon name="X" class="w-4 h-4 text-white/60" />
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-6 space-y-5">

            <!-- Kind -->
            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenSaleTypeLabel }}</label>
              <div class="grid grid-cols-4 gap-2">
                <button v-for="k in [
                    { key: 'fixed',   icon: 'Tag',        label: langStore.t.dealersDenKindFixed, from: '#3148FF', to: '#4C67CF' },
                    { key: 'auction', icon: 'Hammer',     label: langStore.t.dealersDenKindAuction, from: '#FFC01F', to: '#E76F51' },
                    { key: 'ych',     icon: 'Paintbrush', label: 'YCH',        from: '#CD83F5', to: '#7C3AED' },
                    { key: 'raffle',  icon: 'Gift',       label: langStore.t.dealersDenKindRaffle, from: '#66C770', to: '#059669' },
                  ]" :key="k.key"
                  @click="form.listingKind = k.key as ListingKind"
                  class="relative overflow-hidden rounded-2xl py-3.5 flex flex-col items-center gap-1.5 transition-all border"
                  :class="form.listingKind === k.key ? 'border-white/20 shadow-md' : 'border-white/8 hover:border-white/15'"
                  :style="form.listingKind === k.key ? `background: linear-gradient(135deg, ${k.from}28, ${k.to}20)` : 'background: rgba(255,255,255,0.02)'">
                  <BIcon :name="k.icon" class="w-5 h-5" :class="form.listingKind === k.key ? 'text-white' : 'text-white/30'" />
                  <span class="text-[10px] font-bold text-center leading-none"
                    :class="form.listingKind === k.key ? 'text-white' : 'text-white/30'">{{ k.label }}</span>
                </button>
              </div>
            </div>

            <!-- Images -->
            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenPhotosLabel }}</label>
              <MediaUpload type="posts" :multiple="true" :max-files="20" @uploaded="(urls: string[]) => { form.images = urls }" />
            </div>

            <!-- Title -->
            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenTitleLabel }} <span class="text-brand-accent normal-case font-normal">*</span></label>
              <input v-model="form.title" maxlength="200" :placeholder="langStore.t.dealersDenTitlePlaceholderCreate"
                class="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-all" />
            </div>

            <!-- Description -->
            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.fursuitDescLabel }}</label>
              <textarea v-model="form.description" rows="3"
                :placeholder="langStore.t.dealersDenDescPlaceholderCreate"
                class="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-all resize-none" />
            </div>

            <!-- Price + currency -->
            <div class="grid grid-cols-3 gap-3">
              <div class="col-span-2">
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">
                  {{ form.listingKind === 'auction' || form.listingKind === 'ych' ? langStore.t.dealersDenStartPriceLabel : form.listingKind === 'raffle' ? langStore.t.dealersDenTicketPriceLabel : langStore.t.dealersDenPriceLabel }}
                  <span class="text-brand-accent normal-case font-normal">*</span>
                </label>
                <div class="relative">
                  <input v-model.number="form.price" type="number" min="0" step="0.01" placeholder="0.00"
                    class="w-full rounded-2xl px-4 py-3 pr-16 text-sm text-white outline-none transition-all" />
                  <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/20 font-bold">
                    {{ form.price === 0 ? 'FREE' : form.currency }}
                  </span>
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenCurrencyLabel }}</label>
                <select v-model="form.currency" class="w-full rounded-2xl px-3 py-3 text-sm text-white outline-none transition-all appearance-none">
                  <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
                </select>
              </div>
            </div>

            <!-- Auction fields -->
            <div v-if="form.listingKind === 'auction' || form.listingKind === 'ych'"
              class="bg-brand-yellow/5 border border-brand-yellow/15 rounded-2xl p-4 space-y-4">
              <p class="flex items-center gap-1.5 text-xs font-bold text-brand-yellow uppercase tracking-wider">
                <BIcon name="Hammer" class="w-3.5 h-3.5" /> {{ langStore.t.dealersDenAuctionParamsTitle }}
              </p>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenAuctionEndLabel }}</label>
                  <input v-model="form.auctionEndsAt" type="datetime-local"
                    class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all" />
                </div>
                <div>
                  <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenBidStepLabel }}</label>
                  <input v-model.number="form.bidIncrement" type="number" min="0.01" step="0.01"
                    class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all" />
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenAutoBuyOptionalLabel }}</label>
                <input v-model.number="form.autoBuyPrice" type="number" min="0" step="0.01" :placeholder="langStore.t.dealersDenAutoBuyPlaceholder"
                  class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all" />
              </div>
            </div>

            <!-- Raffle fields -->
            <div v-if="form.listingKind === 'raffle'"
              class="bg-brand-success/5 border border-brand-success/15 rounded-2xl p-4 space-y-3">
              <p class="flex items-center gap-1.5 text-xs font-bold text-brand-success uppercase tracking-wider">
                <BIcon name="Gift" class="w-3.5 h-3.5" /> {{ langStore.t.dealersDenRaffleParamsTitle }}
              </p>
              <div>
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenMaxTicketsLabel }}</label>
                <input v-model.number="form.raffleMaxTickets" type="number" min="0"
                  class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all" />
              </div>
            </div>

            <!-- Category (avatar_frame excluded — that category only goes through the
                 dedicated "Загрузить рамку" submission flow, never this generic form) -->
            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.category }}</label>
              <div class="flex flex-wrap gap-2">
                <button v-for="cat in CATS.slice(1).filter(c => c.key !== 'avatar_frame')" :key="cat.key"
                  @click="form.category = cat.key as any"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border"
                  :class="form.category === cat.key
                    ? 'bg-brand-accent/20 border-brand-accent text-brand-accent'
                    : 'border-white/8 text-white/35 hover:text-white hover:border-white/20'">
                  <BIcon :name="cat.icon" class="w-3 h-3" />
                  {{ cat.label }}
                </button>
              </div>
            </div>

            <!-- Type -->
            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenProductTypeLabel }}</label>
              <div class="grid grid-cols-3 gap-2">
                <button v-for="t in [
                    { v: 'physical', l: langStore.t.dealersDenTypePhysical, icon: 'Package',  from: '#059669', to: '#0891B2' },
                    { v: 'digital',  l: langStore.t.dealersDenTypeDigital,   icon: 'Download', from: '#3148FF', to: '#4C67CF' },
                    { v: 'both',     l: langStore.t.dealersDenTypeBoth,         icon: 'Layers',   from: '#D97706', to: '#DC2626' },
                  ]" :key="t.v"
                  @click="form.type = t.v as any"
                  class="relative overflow-hidden rounded-2xl py-3 flex flex-col items-center gap-1.5 transition-all border"
                  :class="form.type === t.v ? 'border-white/20' : 'border-white/8 hover:border-white/15'"
                  :style="form.type === t.v ? `background: linear-gradient(135deg, ${t.from}28, ${t.to}20)` : 'background: rgba(255,255,255,0.02)'">
                  <BIcon :name="t.icon" class="w-5 h-5" :class="form.type === t.v ? 'text-white' : 'text-white/30'" />
                  <span class="text-xs font-bold" :class="form.type === t.v ? 'text-white' : 'text-white/30'">{{ t.l }}</span>
                </button>
              </div>
            </div>

            <!-- Quantity + Status -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenQuantityLabel }}</label>
                <input v-model.number="form.quantity" type="number" min="1"
                  class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.statusFieldLabel }}</label>
                <div class="flex gap-2 h-[46px]">
                  <button v-for="s in [{ v: 'active', l: langStore.t.dealersDenStatusActiveLabel, icon: 'CircleCheck' }, { v: 'draft', l: langStore.t.dealersDenDraftBadge, icon: 'Pencil' }]"
                    :key="s.v" @click="form.status = s.v as any"
                    class="flex-1 flex items-center justify-center gap-1.5 rounded-2xl text-xs font-bold transition-all border"
                    :class="form.status === s.v
                      ? 'bg-brand-accent/20 border-brand-accent text-brand-accent'
                      : 'border-white/8 text-white/30 hover:text-white hover:border-white/20'">
                    <BIcon :name="s.icon" class="w-3.5 h-3.5" />
                    {{ s.l }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Tags -->
            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">
                {{ langStore.t.dealersDenTagsLabel }} <span class="normal-case font-normal text-white/20">{{ langStore.t.dealersDenTagsHint }}</span>
              </label>
              <input v-model="form.tags" :placeholder="langStore.t.dealersDenTagsPlaceholder"
                class="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none transition-all" />
            </div>

            <!-- NSFW -->
            <div class="flex items-center justify-between p-4 rounded-2xl bg-brand-error/5 border border-brand-error/15">
              <div>
                <p class="text-sm font-bold text-white">{{ langStore.t.dealersDenNsfwContentLabel }}</p>
                <p class="text-xs text-white/30 mt-0.5">{{ langStore.t.dealersDenNsfwBlurHint }}</p>
              </div>
              <button @click="form.isNsfw = !form.isNsfw"
                class="w-12 h-6 rounded-full transition-all relative flex-shrink-0"
                :class="form.isNsfw ? 'bg-brand-error' : 'bg-white/10'">
                <div class="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-md"
                  :class="form.isNsfw ? 'left-6' : 'left-0.5'" />
              </button>
            </div>

            <!-- Submit -->
            <div class="flex gap-3 pt-1">
              <div v-if="createError" class="w-full text-red-400 text-xs font-medium bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{{ createError }}</div>
              <button @click="tryCloseCreate()"
                class="px-5 py-3 border border-white/8 text-white/40 text-sm font-bold rounded-2xl transition-all hover:bg-white/5 hover:text-white">
                {{ langStore.t.cancel }}
              </button>
              <button @click="submitCreate" :disabled="isCreating || !form.title.trim()"
                class="flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-35 disabled:cursor-not-allowed text-white text-sm font-bold rounded-2xl transition-all shadow-lg hover:opacity-90"
                :style="form.title.trim() ? 'background: linear-gradient(135deg, #3148FF, #4C67CF)' : 'background: rgba(255,255,255,0.06)'">
                <span v-if="isCreating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <BIcon v-else name="Rocket" class="w-4 h-4" />
                {{ isCreating ? langStore.t.creatingBtn : langStore.t.dealersDenPublishBtn }}
              </button>
            </div>

          </div>
        </div>
      </div>
      </transition>
    </Teleport>

    <!-- ═══ EDIT MODAL ════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <transition name="modal-fade">
      <div v-if="showEditModal"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm"
        @click.self="tryCloseEdit()">
        <div class="modal-form bg-[#0e0e1c] border border-white/8 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden">

          <div class="relative overflow-hidden flex-shrink-0">
            <div class="absolute inset-0" style="background: linear-gradient(135deg, #1e0d00 0%, #100700 100%)" />
            <div class="absolute -top-4 -right-4 w-24 h-24 rounded-full opacity-25 blur-2xl" style="background: #F59E0B" />
            <div class="relative z-10 px-6 pt-5 pb-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, #F59E0B, #EF4444)">
                  <BIcon name="Pencil" class="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 class="text-base font-black text-white">{{ langStore.t.dealersDenEditTitle }}</h2>
                  <p class="text-xs text-white/25 mt-0.5">Dealers' Den · Bloomly</p>
                </div>
              </div>
              <button @click="tryCloseEdit()" class="w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-all">
                <BIcon name="X" class="w-4 h-4 text-white/60" />
              </button>
            </div>
          </div>

          <div class="flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenTitleLabel }}</label>
              <input v-model="editForm.title" maxlength="200" class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all" />
            </div>
            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.fursuitDescLabel }}</label>
              <textarea v-model="editForm.description" rows="3" class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all resize-none" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenPriceLabel }}</label>
                <input v-model.number="editForm.price" type="number" min="0" step="0.01" class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenCurrencyLabel }}</label>
                <select v-model="editForm.currency" class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all appearance-none">
                  <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.dealersDenQuantityLabel }}</label>
                <input v-model.number="editForm.quantity" type="number" min="1" class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all" />
              </div>
              <div>
                <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.statusFieldLabel }}</label>
                <select v-model="editForm.status" class="w-full rounded-2xl px-4 py-3 text-sm text-white outline-none transition-all appearance-none">
                  <option value="active">{{ langStore.t.dealersDenStatusActiveLabel }}</option>
                  <option value="sold">{{ langStore.t.dealersDenSoldBadge }}</option>
                  <option value="draft">{{ langStore.t.dealersDenDraftBadge }}</option>
                  <option value="archived">{{ langStore.t.archiveBtn }}</option>
                </select>
              </div>
            </div>
            <div class="flex gap-3 pt-1">
              <div v-if="editError" class="w-full text-red-400 text-xs font-medium bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{{ editError }}</div>
              <button @click="tryCloseEdit()" class="px-5 py-3 border border-white/8 text-white/40 text-sm font-bold rounded-2xl transition-all hover:bg-white/5 hover:text-white">{{ langStore.t.cancel }}</button>
              <button @click="submitEdit" :disabled="isUpdating"
                class="flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-35 text-white text-sm font-bold rounded-2xl transition-all hover:opacity-90"
                style="background: linear-gradient(135deg, #F59E0B, #EF4444)">
                <span v-if="isUpdating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <BIcon v-else name="Check" class="w-4 h-4" />
                {{ isUpdating ? langStore.t.savingLabel : langStore.t.dealersDenSaveBtn }}
              </button>
            </div>
          </div>
        </div>
      </div>
      </transition>
    </Teleport>

    <!-- ═══ BID MODAL ════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <transition name="modal-fade">
      <div v-if="showBidModal"
        class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm"
        @click.self="showBidModal = false">
        <div class="modal-form bg-[#0e0e1c] border border-white/8 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md flex flex-col overflow-hidden">

          <div class="relative overflow-hidden flex-shrink-0">
            <div class="absolute inset-0" style="background: linear-gradient(135deg, #1c1100 0%, #0e0900 100%)" />
            <div class="absolute -top-4 -right-4 w-28 h-28 rounded-full opacity-25 blur-2xl" style="background: #FFC01F" />
            <div class="relative z-10 px-6 pt-5 pb-4 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center" style="background: linear-gradient(135deg, #FFC01F, #E76F51)">
                  <BIcon name="Hammer" class="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 class="text-base font-black text-white">{{ langStore.t.dealersDenPlaceBidTitle }}</h2>
                  <p v-if="bidListing" class="text-xs text-white/25 mt-0.5 line-clamp-1">{{ bidListing.title }}</p>
                </div>
              </div>
              <button @click="showBidModal = false" class="w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-all">
                <BIcon name="X" class="w-4 h-4 text-white/60" />
              </button>
            </div>
          </div>

          <div class="p-6 space-y-4">
            <div v-if="bidListing" class="flex items-center justify-between bg-brand-yellow/8 border border-brand-yellow/15 rounded-2xl p-4">
              <div>
                <p class="text-[9px] text-white/30 uppercase tracking-wider mb-1">{{ langStore.t.dealersDenCurrentBid }}</p>
                <p class="text-brand-yellow font-extrabold text-2xl tabular-nums leading-none">
                  {{ formatPrice(bidListing.current_bid ?? bidListing.price, bidListing.currency) }}
                </p>
                <p class="text-xs text-white/25 mt-1.5">{{ langStore.t.dealersDenBidsCountLabel }} {{ bidListing.bid_count ?? 0 }}</p>
              </div>
              <div class="text-right">
                <p class="text-[9px] text-white/30 uppercase tracking-wider mb-1">{{ langStore.t.dealersDenUntilEndLabel }}</p>
                <p class="text-xl font-black tabular-nums" :class="isAuctionHot(bidListing.auction_ends_at) ? 'text-brand-error' : 'text-white'">
                  {{ formatCountdown(bidListing.auction_ends_at) || '—' }}
                </p>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">
                {{ langStore.t.dealersDenYourBidLabel }}
                <span v-if="bidListing" class="text-white/20 normal-case font-normal">
                  ({{ langStore.t.dealersDenMinPrefix }} {{ formatPrice((parseFloat(String(bidListing.current_bid ?? bidListing.price)) + parseFloat(String(bidListing.bid_increment ?? 1))).toFixed(2), bidListing.currency) }})
                </span>
              </label>
              <div class="relative">
                <input v-model.number="bidAmount" type="number" min="0" step="0.01"
                  class="w-full rounded-2xl px-4 py-3 pr-16 text-sm text-white outline-none transition-all" />
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/20 font-bold">{{ bidListing?.currency }}</span>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-white/35 uppercase tracking-wider mb-2">
                {{ langStore.t.helpMessageLabel }} <span class="text-white/15 normal-case font-normal">{{ langStore.t.dealersDenOptionalHint }}</span>
              </label>
              <textarea v-model="bidMessage" rows="2" :placeholder="langStore.t.dealersDenBidMessagePlaceholder"
                class="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-white/15 outline-none resize-none transition-all" />
            </div>

            <div v-if="bidError" class="text-brand-error text-xs font-medium bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-3">
              {{ bidError }}
            </div>

            <div class="flex gap-3">
              <button @click="showBidModal = false" class="px-5 py-3 border border-white/8 text-white/40 text-sm font-bold rounded-2xl hover:bg-white/5 hover:text-white transition-all">{{ langStore.t.cancel }}</button>
              <button @click="submitBid" :disabled="isBidding || bidAmount <= 0"
                class="flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-35 text-white text-sm font-extrabold rounded-2xl transition-all hover:opacity-90 shadow-lg"
                style="background: linear-gradient(135deg, #FFC01F, #E76F51)">
                <span v-if="isBidding" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <BIcon v-else name="Hammer" class="w-4 h-4" />
                {{ isBidding ? langStore.t.helpSubmitting : langStore.t.dealersDenConfirmBidBtn }}
              </button>
            </div>
          </div>
        </div>
      </div>
      </transition>
    </Teleport>

    <!-- NSFW confirm modal -->
    <Teleport to="body">
      <transition name="modal-fade">
        <div v-if="showNsfwConfirm"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style="background: rgba(0,0,0,0.75); backdrop-filter: blur(8px)"
          @click.self="showNsfwConfirm = false">
          <div class="w-full max-w-sm rounded-3xl border border-brand-border shadow-2xl overflow-hidden"
            style="background: linear-gradient(145deg, #1a1b35, #13142a)">
            <div class="flex flex-col items-center pt-8 pb-5 px-6 text-center">
              <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl mb-4"
                style="background: rgba(225,70,100,0.15); border: 1px solid rgba(225,70,100,0.3)">
                🔞
              </div>
              <h2 class="text-lg font-extrabold text-white mb-2">{{ langStore.t.dealersDenNsfwContentLabel }}</h2>
              <p class="text-sm text-white/55 leading-relaxed">
                {{ langStore.t.dealersDenNsfwLotWarning }}<br>
                {{ canUseNsfw ? langStore.t.dealersDenEnableNsfwHint : langStore.t.dealersDenConfirmBirthDateHint }}
              </p>
            </div>
            <div class="mx-6 mb-5 px-4 py-3 rounded-2xl flex items-start gap-2.5"
              style="background: rgba(225,70,100,0.08); border: 1px solid rgba(225,70,100,0.2)">
              <BIcon name="AlertTriangle" class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p class="text-xs text-rose-300/80 leading-relaxed">
                {{ langStore.t.dealersDenNsfwAgreeText }}
                <span class="text-rose-400 font-semibold">{{ langStore.t.dealersDenPlatformRulesLabel }}</span>.
              </p>
            </div>
            <div class="flex gap-3 px-6 pb-6">
              <button
                @click="showNsfwConfirm = false"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white/50 bg-white/5 hover:bg-white/10 border border-brand-border transition-all">
                {{ langStore.t.cancel }}
              </button>
              <button
                @click="handleEnableNsfw(); showNsfwConfirm = false"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white transition-all shadow-lg"
                style="background: linear-gradient(135deg, #c0392b, #e14664); box-shadow: 0 4px 20px rgba(225,70,100,0.3)">
                {{ canUseNsfw ? langStore.t.dealersDenEnableNsfwBtn : langStore.t.dealersDenConfirmAgeBtn }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <SubmitFrameModal v-model="showFrameModal" />

  </div>
</template>

<style scoped>
.modal-form input,
.modal-form textarea,
.modal-form select {
  background-color: #0a0a1a !important;
  border: 1px solid rgba(255,255,255,0.08) !important;
}
.modal-form input:focus,
.modal-form textarea:focus,
.modal-form select:focus {
  border-color: rgba(76, 103, 207, 0.45) !important;
  background-color: rgba(49, 72, 255, 0.04) !important;
}
.modal-fade-enter-active,  .modal-fade-leave-active  { transition: opacity 0.2s ease; }
.modal-fade-enter-from,    .modal-fade-leave-to      { opacity: 0; }
.scrollbar-none               { scrollbar-width: none; }
.scrollbar-none::-webkit-scrollbar { display: none; }

/* Loading bar */
.fade-bar-enter-active, .fade-bar-leave-active { transition: opacity 0.3s ease; }
.fade-bar-enter-from, .fade-bar-leave-to { opacity: 0; }

@keyframes loading-bar {
  0%   { background-position: 0% 50%; transform: scaleX(0.3); transform-origin: left; }
  50%  { background-position: 100% 50%; transform: scaleX(0.8); transform-origin: left; }
  100% { background-position: 0% 50%; transform: scaleX(1); transform-origin: left; }
}
.animate-loading-bar {
  animation: loading-bar 1.2s ease-in-out infinite;
  background-size: 200% 100%;
}
</style>
