<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import { useAuthStore } from '@/stores/auth'
import { useWalletStore } from '@/stores/wallet'
import { useDealersDenStore, type DealerListing, type ListingKind } from '@/stores/dealersDen'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useConfirm } from '@/composables/useConfirm'
import { useFlash } from '@/composables/useFlash'
import { listingShop } from '@/lib/dealerShop'
import { apiErrorMessage } from '@/lib/apiError'
import { KIND_META, KIND_ORDER } from '@/lib/denKinds'
import { emptySmartPick, smartPickCount, matchesSmartPick, budgetRanges, hasBudget, BUDGET_CURRENCIES, type SmartPick } from '@/lib/smartPick'
import { canSellInDen } from '@/lib/verificationPolicy'
import { displayCurrency, loadRates } from '@/lib/displayCurrency'
import * as fmt from '@/lib/format'
import api from '@/api'
import AppHeader    from '@/components/AppHeader.vue'
import AppSidebar   from '@/components/AppSidebar.vue'
import WalletCard   from '@/components/WalletCard.vue'
import BIcon        from '@/components/BIcon.vue'
import DenWeeklyTop from '@/components/DenWeeklyTop.vue'
import DenCountdown from '@/components/DenCountdown.vue'
import DenSmartPickModal from '@/components/DenSmartPickModal.vue'
import DenPublishedModal from '@/components/DenPublishedModal.vue'
import MarketHero   from '@/components/ui/MarketHero.vue'
import EmptyState   from '@/components/ui/EmptyState.vue'
import FlashToast   from '@/components/ui/FlashToast.vue'
import DenListingCard  from '@/components/den/DenListingCard.vue'
import DenCreateModal, { type CreatedInfo } from '@/components/den/DenCreateModal.vue'
import DenEditModal    from '@/components/den/DenEditModal.vue'
import DenBidModal     from '@/components/den/DenBidModal.vue'
import DenNsfwModal    from '@/components/den/DenNsfwModal.vue'

const langStore = useLangStore()
const t = computed(() => langStore.t)
const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const store  = useDealersDenStore()
const walletStore = useWalletStore()
const { confirmDialog } = useConfirm()
const { nsfwEnabled } = useNsfwMode()
const { flash, ok: flashOk, err: flashErr, dispose: disposeFlash } = useFlash()

// ── Право продавать ─────────────────────────────────────────────────────────────
type DenGroupRef = { id: string; slug: string; name: string; avatar_url: string | null; type: string }
const sellerAccess = ref<{ canSell: boolean; ownsShop: boolean; frozen: boolean; groups: DenGroupRef[]; connectable: DenGroupRef[] } | null>(null)
const denGroups = computed(() => sellerAccess.value?.groups ?? [])
const hasDenGroup = computed(() => denGroups.value.length > 0)
// Куда ведёт «подключить»: подходящая группа, где Dealers Den ещё не подключён, иначе список групп
const connectLink = computed(() => {
  const g = sellerAccess.value?.connectable?.[0]
  return g ? `/groups/${g.slug}?tab=dealers-den` : '/groups'
})
const canSell = computed(() => auth.user?.is_verified === true && sellerAccess.value?.canSell === true)
const hasSellerRole = computed(() => canSellInDen(auth.user, sellerAccess.value?.ownsShop === true))
let accessGeneration = 0
watch(() => [auth.user?.id, auth.user?.is_verified, auth.user?.verification_type], async () => {
  const seq = ++accessGeneration
  sellerAccess.value = null
  if (!auth.user?.id) return
  try {
    const res = await api.get('/dealers-den/eligibility')
    if (seq === accessGeneration && res.data.success) sellerAccess.value = res.data.data
  } catch { /* без доступа кнопка «Выставить» просто не появится */ }
}, { immediate: true })

// ── Вкладки, фильтры, сортировка ────────────────────────────────────────────────
type MainTab = 'browse' | 'my' | 'wishlist' | 'drafts'
const activeTab = ref<MainTab>('browse')

const CATS = computed(() => [
  { key: 'all',     label: t.value.tabAll,               icon: 'LayoutGrid' },
  { key: 'art',     label: t.value.dealersDenCatArt,     icon: 'Palette'    },
  { key: 'fursuit', label: t.value.fursuitTab,           icon: 'Sparkles'   },
  { key: 'badge',   label: t.value.dealersDenCatBadges,  icon: 'Award'      },
  { key: 'print',   label: t.value.dealersDenCatPrints,  icon: 'Printer'    },
  { key: 'music',   label: t.value.dealersDenCatMusic,   icon: 'Music'      },
  { key: 'craft',   label: t.value.dealersDenCatCraft,   icon: 'Scissors'   },
  { key: 'merch',   label: t.value.dealersDenCatMerch,   icon: 'Shirt'      },
  { key: 'other',   label: t.value.other,                icon: 'Package'    },
])
const selectedCategory = ref('all')

const kindLabel = (k: ListingKind) => KIND_META[k].labelKey ? (t.value as Record<string, string>)[KIND_META[k].labelKey!] : KIND_META[k].label!
const KINDS = computed(() => [
  { key: '' as '' | ListingKind, label: t.value.tabAll, icon: 'LayoutGrid' },
  ...KIND_ORDER.map(k => ({ key: k as '' | ListingKind, label: kindLabel(k), icon: KIND_META[k].icon })),
])
const selectedKind = ref<'' | ListingKind>('')

const SORTS = computed(() => [
  { key: 'newest',     label: t.value.dealersDenSortNewest },
  { key: 'price_asc',  label: t.value.dealersDenSortPriceAsc },
  { key: 'price_desc', label: t.value.dealersDenSortPriceDesc },
  { key: 'popular',    label: t.value.dealersDenSortPopular },
])
const selectedSort = ref('newest')

const selectedType = ref<'' | 'digital' | 'physical' | 'both'>('')
const TYPE_FILTERS = computed(() => [
  { v: '', icon: 'Globe', title: t.value.tabAll },
  { v: 'digital', icon: 'Download', title: t.value.dealersDenTypeDigital },
  { v: 'physical', icon: 'Package', title: t.value.dealersDenTypePhysical },
] as const)

const searchQuery = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadData, 500)
}

// «Мои», избранное и черновики загружены целиком, поэтому фильтры к ним применяются здесь
function matchesFilters(l: DealerListing) {
  if (selectedKind.value && l.listing_kind !== selectedKind.value) return false
  if (selectedCategory.value !== 'all' && l.category !== selectedCategory.value) return false
  if (selectedType.value && l.type !== selectedType.value && l.type !== 'both') return false
  if (!matchesSmartPick(l, smart.value)) return false
  const q = searchQuery.value.trim().toLowerCase()
  if (q && !l.title.toLowerCase().includes(q) && !(l.description ?? '').toLowerCase().includes(q) && !l.tags.includes(q)) return false
  return true
}

const draftListings = computed(() => store.myListings.filter(l => l.status === 'draft'))
watch(() => draftListings.value.length, n => { if (n === 0 && activeTab.value === 'drafts') activeTab.value = 'browse' })

const displayListings = computed<DealerListing[]>(() => {
  if (activeTab.value === 'my') return store.myListings.filter(matchesFilters)
  if (activeTab.value === 'wishlist') return store.wishlist.filter(matchesFilters)
  if (activeTab.value === 'drafts') return draftListings.value.filter(matchesFilters)
  return store.listings
})

// В общем списке лоты раскладываются по видам продажи отдельными рядами; с выбранным видом — один ряд
const listingSections = computed(() => {
  const items = displayListings.value
  if (selectedKind.value) return [{ kind: '' as '' | ListingKind, items }]
  return KIND_ORDER
    .map(kind => ({ kind: kind as '' | ListingKind, items: items.filter(l => (l.listing_kind ?? 'fixed') === kind) }))
    .filter(sec => sec.items.length > 0)
})

// ── Умный подбор ────────────────────────────────────────────────────────────────
const smartCurrency = computed(() => displayCurrency.value && BUDGET_CURRENCIES.includes(displayCurrency.value) ? displayCurrency.value : 'USD')
const smart = ref<SmartPick>(emptySmartPick())
const showSmart = ref(false)
const smartActive = computed(() => smartPickCount({ ...smart.value, category: selectedCategory.value, type: selectedType.value as any, kind: selectedKind.value, sort: selectedSort.value }))
const smartKinds = computed(() => [
  { key: '', label: '', icon: 'LayoutGrid', hint: t.value.dealersDenSmartAnyKindHint },
  { key: 'fixed', label: kindLabel('fixed'), icon: 'Tag', hint: t.value.dealersDenSmartFixedHint },
  { key: 'auction', label: kindLabel('auction'), icon: 'Hammer', hint: t.value.dealersDenPromoAuctionsSub },
  { key: 'ych', label: 'YCH', icon: 'Paintbrush', hint: t.value.dealersDenPromoYchSub },
  { key: 'raffle', label: kindLabel('raffle'), icon: 'Gift', hint: t.value.dealersDenPromoRaffleSub },
  { key: 'commission_queue', label: kindLabel('commission_queue'), icon: 'ListOrdered', hint: t.value.dealersDenPromoCommissionSub },
])
function openSmart() {
  void loadRates()
  smart.value = { ...smart.value, category: selectedCategory.value, type: selectedType.value as any, kind: selectedKind.value, sort: selectedSort.value,
    budgetCurrency: hasBudget(smart.value) ? smart.value.budgetCurrency : smartCurrency.value }
  showSmart.value = true
}
function applySmart(p: SmartPick) {
  smart.value = p
  selectedCategory.value = p.category
  selectedType.value = p.type
  selectedKind.value = p.kind as any
  selectedSort.value = p.sort
  showSmart.value = false
  loadData()
}
const resetSmart = () => applySmart(emptySmartPick(smartCurrency.value))

// ── Загрузка ────────────────────────────────────────────────────────────────────
function listingsFilters() {
  return {
    category:    selectedCategory.value !== 'all' ? selectedCategory.value as any : undefined,
    type:        selectedType.value  || undefined,
    listingKind: selectedKind.value  || undefined,
    search:      searchQuery.value || undefined,
    sort:        selectedSort.value !== 'newest' ? selectedSort.value : undefined,
    onlyDiscount: smart.value.onlyDiscount ? '1' : undefined,
    priceRanges: hasBudget(smart.value) ? JSON.stringify(budgetRanges(smart.value)) : undefined,
  }
}

async function loadData() {
  await Promise.all([
    store.loadListings(listingsFilters()),
    auth.user ? store.loadMyListings() : Promise.resolve(),
    auth.user ? store.loadBumpInfo().catch(() => {}) : Promise.resolve(),
    auth.user ? store.loadMyWishlist().catch(() => {}) : Promise.resolve(),
  ])
}
const loadMore = () => store.loadMoreListings(listingsFilters())

// #хэштег с карточки или страницы лота приходит как ?search=<тег>: серверный поиск уже матчится и по тегам
if (typeof route.query.search === 'string') {
  searchQuery.value = route.query.search
  selectedCategory.value = 'all'
}
function filterByTag(tag: string) {
  selectedCategory.value = 'all'
  searchQuery.value = tag
  loadData()
}
function selectCategory(key: string) { selectedCategory.value = key; loadData() }
function selectKind(k: '' | ListingKind) { selectedKind.value = k; loadData() }
function selectType(v: '' | 'digital' | 'physical' | 'both') { selectedType.value = v; loadData() }

const trendingTags = ref<{ tag: string; count: number }[]>([])
store.getTrendingTags().then(tags => { trendingTags.value = tags }).catch(() => {})

onMounted(loadData)
watch([selectedSort, nsfwEnabled], loadData)

// ── Часы: только проверка «аукцион закончился»; живые таймеры тикают внутри DenCountdown ──
const now = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval>
onMounted(() => { clockTimer = setInterval(() => { now.value = Date.now() }, 15000) })
onUnmounted(() => { clearInterval(clockTimer); clearTimeout(searchTimer); disposeFlash() })

const isAuctionEnded = (l: DealerListing) => !!l.auction_ends_at && new Date(l.auction_ends_at).getTime() <= now.value
const price = (v: string | number | null | undefined, cur: string) => fmt.formatPrice(v as never, cur)

const liveAuctions = computed(() =>
  store.listings.filter(l =>
    (l.listing_kind === 'auction' || l.listing_kind === 'ych') && l.status === 'active' && l.auction_ends_at &&
    new Date(l.auction_ends_at).getTime() > now.value,
  ).slice(0, 6),
)

const heroStats = computed(() => [
  { icon: 'ShoppingBag', label: t.value.dealersDenListingsStatLabel, value: store.total },
  { icon: 'Hammer',      label: t.value.dealersDenStatAuctions,   value: store.listings.filter(l => l.listing_kind === 'auction' || l.listing_kind === 'ych').length },
  { icon: 'Gift',        label: t.value.dealersDenStatRaffles,    value: store.listings.filter(l => l.listing_kind === 'raffle').length },
  { icon: 'ListOrdered', label: t.value.dealersDenStatCommissions, value: store.listings.filter(l => l.listing_kind === 'commission_queue').length },
])

// Кнопки вкладок в шапке: повторный клик возвращает в каталог
const heroTabs = computed(() => [
  { tab: 'wishlist' as MainTab, show: true,                         icon: 'Heart',        label: t.value.dealersDenWishlistTab,    count: store.wishlist.length },
  { tab: 'drafts'   as MainTab, show: draftListings.value.length > 0, icon: 'Pencil',     label: t.value.dealersDenDraftsTab,      count: draftListings.value.length },
  { tab: 'my'       as MainTab, show: true,                         icon: 'ClipboardList', label: t.value.dealersDenMyListingsLabel, count: 0 },
].filter(x => x.show))
const toggleTab = (tab: MainTab) => { activeTab.value = activeTab.value === tab ? 'browse' : tab }

const sectionTitle = computed(() =>
  activeTab.value === 'drafts' ? t.value.dealersDenDraftsTab
  : activeTab.value === 'wishlist' ? t.value.dealersDenWishlistTab
  : activeTab.value === 'my' ? t.value.dealersDenMyListingsLabel
  : selectedKind.value ? (KINDS.value.find(k => k.key === selectedKind.value)?.label ?? t.value.dealersDenCatalogFallback)
  : t.value.dealersDenAllListingsLabel)

const emptyState = computed(() => {
  switch (activeTab.value) {
    case 'wishlist': return { title: t.value.dealersDenWishlistEmpty, hint: t.value.dealersDenWishlistEmptyHint }
    case 'my':       return { title: t.value.dealersDenNoListings, hint: t.value.dealersDenPostFirstHint }
    default:         return { title: t.value.dealersDenNothingFound, hint: t.value.dealersDenTryOtherFilterHint }
  }
})

// ── Избранное (сердечко на карточке) ────────────────────────────────────────────
const wishlistBusy = ref<string | null>(null)
async function toggleWishlist(listing: DealerListing) {
  if (!auth.user) { router.push({ name: 'login' }); return }
  if (wishlistBusy.value) return
  wishlistBusy.value = listing.id
  const was = !!listing.is_wishlisted
  listing.is_wishlisted = !was
  listing.wishlist_count = Math.max(0, (listing.wishlist_count ?? 0) + (was ? -1 : 1))
  try {
    if (was) {
      await store.removeFromWishlist(listing.id)
    } else {
      await store.addToWishlist(listing.id)
      if (!store.wishlist.some(l => l.id === listing.id)) store.wishlist.unshift(listing)
    }
    for (const l of store.listings) if (l.id === listing.id) { l.is_wishlisted = !was; l.wishlist_count = listing.wishlist_count }
  } catch (e) {
    listing.is_wishlisted = was
    listing.wishlist_count = Math.max(0, (listing.wishlist_count ?? 0) + (was ? 1 : -1))
    flashErr(apiErrorMessage(e) ?? t.value.dealersDenGenericRetryError)
  } finally { wishlistBusy.value = null }
}

// ── Открытие лота и 18+ ─────────────────────────────────────────────────────────
const showNsfw = ref(false)
function openListing(listing: DealerListing) {
  if (listing.is_nsfw && !nsfwEnabled.value) { showNsfw.value = true; return }
  router.push({ name: 'dealer-listing', params: { id: listing.id } })
}

// ── Создание ────────────────────────────────────────────────────────────────────
const showCreate = ref(false)
const published = ref<CreatedInfo | null>(null)
function openCreate() {
  if (!auth.user) { router.push({ name: 'login' }); return }
  if (canSell.value) showCreate.value = true
}
// ?create=1 (ссылка из группы) сразу открывает форму нового лота
watch([sellerAccess, () => route.query.create], ([acc, c]) => {
  if (c !== '1' || !acc) return
  router.replace({ query: { ...route.query, create: undefined } })
  openCreate()
})
function openPublished() {
  const id = published.value?.id
  published.value = null
  if (id) router.push({ name: 'dealer-listing', params: { id } })
}

// ── Правка, удаление, поднятия ──────────────────────────────────────────────────
const editing = ref<DealerListing | null>(null)

async function deleteListing(id: string) {
  if (!(await confirmDialog(t.value.dealersDenDeleteListingConfirm, { danger: true }))) return
  try { await store.deleteListing(id) }
  catch (e) { flashErr(apiErrorMessage(e) ?? t.value.dealersDenDeleteFailed) }
}

const bumpingId = ref('')
function bumpTitle() {
  const info = store.bumpInfo
  if (!info) return t.value.dealersDenBump
  return info.freeLeft > 0
    ? `${t.value.dealersDenBump} (${t.value.dealersDenBumpFreeLeft} ${info.freeLeft})`
    : `${t.value.dealersDenBump} — ${fmt.formatBlm(info.priceBlm)}`
}
async function bumpListing(l: DealerListing) {
  if (bumpingId.value) return
  bumpingId.value = l.id
  try {
    const bump = await store.bumpListing(l.id)
    if (bump.kind === 'paid') void walletStore.fetchBalance()
    flashOk(t.value.dealersDenBumpDone)
  } catch (err: any) {
    const code = err?.response?.data?.code
    flashErr(code === 'BUMP_TOO_SOON' ? t.value.dealersDenBumpTooSoon
      : code === 'INSUFFICIENT_FUNDS' ? t.value.dealersDenBumpNoFunds
      : apiErrorMessage(err) ?? t.value.dealersDenBumpFailed)
  } finally { bumpingId.value = '' }
}
async function toggleAutoBump(l: DealerListing) {
  if (!store.bumpInfo?.canAutoBump) { flashErr(t.value.dealersDenAutoBumpPlan); return }
  try { await store.setAutoBump(l.id, !l.auto_bump) }
  catch (e) { flashErr(apiErrorMessage(e) ?? t.value.dealersDenBumpFailed) }
}

// ── Ставки и билеты ─────────────────────────────────────────────────────────────
const bidding = ref<DealerListing | null>(null)
function openBid(listing: DealerListing) {
  if (!auth.user) { router.push({ name: 'login' }); return }
  bidding.value = listing
}
const buyingTicketId = ref<string | null>(null)
async function buyTicket(listing: DealerListing) {
  if (!auth.user) { router.push({ name: 'login' }); return }
  if (buyingTicketId.value) return
  if (!(await confirmDialog(t.value.dealersDenBuyTicketConfirm + ' ' + price(listing.price, listing.currency) + '?'))) return
  buyingTicketId.value = listing.id
  try {
    await store.buyRaffleTicket(listing.id)
    flashOk(t.value.dealersDenTicketBtn)
  } catch (e) {
    flashErr(apiErrorMessage(e) ?? t.value.dealersDenGenericRetryError)
  } finally { buyingTicketId.value = null }
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20 stack-y-5">

        <!-- Шапка -->
        <MarketHero title="Dealers' Den" icon="Store" tone="accent" :stats="heroStats"
          :subtitle="`${store.isLoading ? '…' : store.total} ${t.dealersDenListingsCountLabel} · ${t.dealersDenMarketplaceTagline}`">
          <template #tagline>
            {{ t.dealersDenHeroArts }}, <span class="text-brand-yellow font-semibold">{{ t.dealersDenHeroAuctions }}</span>,
            <span class="text-brand-purple font-semibold">YCH</span>,
            <span class="text-brand-success font-semibold">{{ t.dealersDenHeroRaffles }}</span> {{ t.dealersDenHeroConnector }}
            <span class="text-brand-accent-minus font-semibold">Bloomly</span>.
          </template>
          <template #side>
            <WalletCard v-if="auth.user" />
            <label class="flex items-center gap-2 bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl px-4 py-2.5">
              <BIcon name="Search" class="w-4 h-4 text-white/50 shrink-0" />
              <input v-model="searchQuery" :placeholder="t.dealersDenSearchPlaceholderHero" @keyup.enter="loadData()"
                class="bg-transparent text-sm text-white placeholder-white/35 outline-hidden w-full" />
            </label>
            <template v-if="auth.user">
              <button v-for="h in heroTabs" :key="h.tab" @click="toggleTab(h.tab)"
                class="flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-bold rounded-2xl transition-all border"
                :class="activeTab === h.tab ? 'bg-brand-gradient border-transparent' : 'bg-white/8 border-white/12 hover:bg-white/12'">
                <BIcon :name="h.icon" class="w-4 h-4" :class="activeTab === h.tab && h.tab === 'wishlist' ? 'fill-current' : ''" />
                {{ activeTab === h.tab ? t.dealersDenMarketplaceLabel : h.label }}
                <span v-if="h.count && activeTab !== h.tab" class="text-[11px] text-white/60 tabular-nums">{{ h.count }}</span>
              </button>
            </template>
          </template>
        </MarketHero>

        <!-- Виды продажи, категории, поиск и сортировка -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2 flex-wrap m-scroll-row max-md:-mx-3 max-md:px-3">
            <button v-for="k in KINDS" :key="k.key" @click="selectKind(k.key)"
              class="pill px-4 py-2 text-sm" :class="selectedKind === k.key ? 'pill-active' : 'pill-idle'">
              <BIcon :name="k.icon" class="w-3.5 h-3.5" /> {{ k.label }}
            </button>
            <button v-if="auth.user && canSell" @click="openCreate" class="xl:hidden pill pill-active ml-auto px-4 py-2 text-sm">
              <BIcon name="Plus" class="w-3.5 h-3.5" /> {{ t.dealersDenPostBtn }}
            </button>
          </div>

          <div class="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            <button v-for="cat in CATS" :key="cat.key" @click="selectCategory(cat.key)"
              class="pill px-3.5 py-1.5 text-xs"
              :class="selectedCategory === cat.key ? 'pill-tint' : 'pill-idle'">
              <BIcon :name="cat.icon" class="w-3 h-3" /> {{ cat.label }}
            </button>
          </div>

          <div class="flex gap-2 items-center">
            <div class="relative flex-1">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none" />
              <input v-model="searchQuery" @input="onSearchInput" :placeholder="t.dealersDenSearchPlaceholder"
                class="w-full bg-brand-card border border-brand-border rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-white/20 outline-hidden focus:border-brand-accent/50 transition-all" />
            </div>
            <button type="button" @click="openSmart" class="pill pill-active px-4 py-2 text-sm">
              <BIcon name="Sparkles" class="w-3.5 h-3.5" />
              <span class="max-sm:hidden">{{ t.dealersDenSmartTitle }}</span>
              <span v-if="smartActive" class="min-w-4 h-4 px-1 rounded-full bg-white/25 text-[10px] font-extrabold flex items-center justify-center tabular-nums">{{ smartActive }}</span>
            </button>
            <button v-if="smartActive" type="button" @click="resetSmart" :title="t.dealersDenSmartReset" class="pill pill-idle w-8 h-8 justify-center">
              <BIcon name="X" class="w-3.5 h-3.5" />
            </button>
            <select v-model="selectedSort"
              class="bg-brand-card border border-brand-border rounded-full px-3.5 py-2 text-sm text-white/60 outline-hidden appearance-none cursor-pointer shrink-0">
              <option v-for="s in SORTS" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
            <div class="flex gap-1 shrink-0">
              <button v-for="ty in TYPE_FILTERS" :key="ty.v" @click="selectType(ty.v)" :title="ty.title"
                class="pill w-8 h-8 justify-center"
                :class="selectedType === ty.v ? 'pill-tint' : 'pill-idle'">
                <BIcon :name="ty.icon" class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Аукционы, которые идут прямо сейчас -->
        <section v-if="liveAuctions.length && selectedKind === '' && activeTab === 'browse'" class="stack-y-3">
          <h2 class="section-title">
            <span class="w-2 h-2 rounded-full bg-brand-error animate-pulse inline-block" />
            <BIcon name="Flame" class="w-4 h-4 text-brand-yellow" />
            {{ t.dealersDenLiveLabel }} · {{ t.dealersDenLabelAuctions }}
          </h2>
          <div class="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            <div v-for="l in liveAuctions" :key="l.id" @click="openListing(l)"
              class="card-surface shrink-0 w-44 cursor-pointer group border-brand-yellow/20 hover:border-brand-yellow/50 transition-all hover:shadow-brand-yellow/10 hover:-translate-y-0.5">
              <div class="relative h-28 bg-brand-bg overflow-hidden">
                <img v-if="l.images[0]" :src="l.images[0]" :alt="l.title" loading="lazy" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div v-else class="w-full h-full flex items-center justify-center"><BIcon name="Hammer" class="w-10 h-10 text-brand-yellow/30" /></div>
                <div class="absolute inset-0 bg-linear-to-t/srgb from-black/70 to-transparent" />
                <div class="absolute bottom-2 inset-x-2 flex items-end justify-between">
                  <span class="text-[10px] font-extrabold text-brand-yellow leading-none">{{ price(l.current_bid ?? l.price, l.currency) }}</span>
                  <DenCountdown v-slot="{ text, hot }" :ends-at="l.auction_ends_at">
                    <span class="text-[9px] font-bold tabular-nums" :class="hot ? 'text-brand-error' : 'text-white/60'">{{ text }}</span>
                  </DenCountdown>
                </div>
              </div>
              <div class="p-2.5">
                <p class="text-white text-xs font-bold line-clamp-1">{{ l.title }}</p>
                <p class="text-white/40 text-[10px] mt-0.5 truncate">{{ listingShop(l).name }}</p>
              </div>
            </div>
          </div>
        </section>

        <div class="flex items-center justify-between">
          <h2 class="section-title"><BIcon name="LayoutGrid" class="w-4 h-4 text-brand-accent" /> {{ sectionTitle }}</h2>
          <span class="text-xs text-white/35 font-medium">{{ activeTab !== 'browse' ? displayListings.length : store.total }} {{ t.dealersDenPiecesAbbr }}</span>
        </div>

        <!-- Каталог -->
        <div v-if="store.isLoading" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div v-for="n in 6" :key="n" class="card-surface animate-pulse">
            <div class="w-full aspect-4/3 bg-brand-border" />
            <div class="p-3 stack-y-1.5"><div class="h-3.5 bg-brand-border rounded-full w-3/4" /><div class="h-3 bg-brand-border rounded-full w-1/2" /></div>
          </div>
        </div>

        <EmptyState v-else-if="!displayListings.length" icon="ShoppingBag" :title="emptyState.title" :hint="emptyState.hint">
          <button v-if="activeTab === 'my' && canSell" @click="openCreate"
            class="inline-flex items-center gap-2 px-5 py-2.5 text-white text-sm font-bold rounded-2xl transition-all hover:opacity-90 bg-brand-gradient">
            <BIcon name="Plus" class="w-4 h-4" /> {{ t.dealersDenCreateListingBtn }}
          </button>
        </EmptyState>

        <div v-else class="stack-y-7">
          <section v-for="sec in listingSections" :key="sec.kind" class="stack-y-3">
            <h3 v-if="sec.kind" class="section-title" :class="KIND_META[sec.kind].text">
              <BIcon :name="KIND_META[sec.kind].icon" class="w-4 h-4" /> {{ kindLabel(sec.kind) }}
              <span class="text-xs text-white/30 font-medium tabular-nums normal-case tracking-normal">{{ sec.items.length }}</span>
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <DenListingCard v-for="l in sec.items" :key="l.id" :listing="l" :mode="activeTab" :viewer-id="auth.user?.id"
                :ended="isAuctionEnded(l)" :can-auto-bump="!!store.bumpInfo?.canAutoBump" :bump-hint="bumpTitle()"
                :bumping="bumpingId === l.id" :buying-ticket="buyingTicketId === l.id"
                @open="openListing(l)" @nsfw="showNsfw = true" @wishlist="toggleWishlist(l)" @bid="openBid(l)" @ticket="buyTicket(l)"
                @tag="filterByTag" @edit="editing = l" @remove="deleteListing(l.id)" @bump="bumpListing(l)" @autobump="toggleAutoBump(l)" />
            </div>
          </section>
        </div>

        <div v-if="activeTab === 'browse' && store.listings.length < store.total" class="flex justify-center">
          <button @click="loadMore" :disabled="store.isLoadingMore" class="pill pill-idle px-6 py-2.5 text-sm disabled:opacity-40">{{ t.dealersDenLoadMore }}</button>
        </div>
      </main>

      <!-- Правая колонка -->
      <aside class="w-52 hidden xl:flex flex-col gap-4 sticky top-24 self-start shrink-0">
        <div v-if="auth.user">
          <button v-if="canSell" @click="openCreate"
            class="w-full flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-2xl transition-all shadow-lg hover:opacity-90 bg-brand-gradient">
            <BIcon name="Plus" class="w-4 h-4" /> {{ t.dealersDenPostItemBtn }}
          </button>
          <div v-else class="card-surface p-3.5 stack-y-3">
            <div class="flex items-center gap-2.5">
              <div class="w-7 h-7 rounded-xl bg-brand-bg flex items-center justify-center"><BIcon name="Lock" class="w-3.5 h-3.5 text-white/30" /></div>
              <p class="text-xs font-bold text-white/50">{{ t.dealersDenRequirementsLabel }}</p>
            </div>
            <div class="stack-y-2 text-xs">
              <div v-for="req in [
                { done: !!auth.user.is_verified, label: t.secVerification },
                { done: hasSellerRole, label: t.dealersDenArtistMasterLabel },
                { done: hasDenGroup, label: t.dealersDenReqGroupLabel },
              ]" :key="req.label" class="flex items-center gap-2">
                <BIcon :name="req.done ? 'CheckCircle2' : 'Circle'" class="w-4 h-4 shrink-0" :class="req.done ? 'text-brand-success' : 'text-brand-border'" />
                <span :class="req.done ? 'text-white/60' : 'text-white/25'">{{ req.label }}</span>
              </div>
            </div>
            <button @click="auth.user.is_verified && hasSellerRole ? router.push(connectLink) : router.push({ name: 'settings' })"
              class="w-full text-center py-2 rounded-xl text-xs font-bold text-brand-accent bg-brand-accent/8 border border-brand-accent/20 hover:bg-brand-accent/15 transition-all">
              {{ auth.user.is_verified && hasSellerRole ? t.dealersDenConnectGroupBtn : t.dealersDenApplyBtn }}
            </button>
          </div>
        </div>
        <button v-else @click="router.push({ name: 'login' })"
          class="w-full flex items-center justify-center gap-2 py-3 text-white/60 text-sm font-bold rounded-2xl transition-all border border-brand-border hover:border-brand-accent/40 hover:text-white">
          <BIcon name="LogIn" class="w-4 h-4" /> {{ t.dealersDenLoginToSellBtn }}
        </button>

        <div v-if="trendingTags.length" class="card-surface p-3.5 stack-y-2.5">
          <h4 class="field-label !mb-0">{{ t.dealersDenTrendingTagsLabel }}</h4>
          <div class="flex flex-wrap gap-1.5">
            <button v-for="tg in trendingTags" :key="tg.tag" @click="filterByTag(tg.tag)"
              class="text-[10px] font-bold text-brand-accent bg-brand-accent/8 hover:bg-brand-accent/15 px-2.5 py-1 rounded-full transition-colors">#{{ tg.tag }}</button>
          </div>
        </div>

        <div class="card-surface p-4 stack-y-2">
          <h4 class="field-label">{{ t.dealersDenStatsTitle }}</h4>
          <div class="flex items-center justify-between"><span class="text-xs text-white/45">{{ t.dealersDenListingsStatLabel }}</span><span class="text-sm font-bold text-white">{{ store.total }}</span></div>
          <div class="flex items-center justify-between"><span class="text-xs text-white/45">{{ t.dealersDenLiveAuctionsStatLabel }}</span><span class="text-sm font-bold text-brand-yellow">{{ liveAuctions.length }}</span></div>
          <div v-if="auth.user" class="flex items-center justify-between"><span class="text-xs text-white/45">{{ t.dealersDenMineStatLabel }}</span><span class="text-sm font-bold text-white">{{ store.myListings.length }}</span></div>
        </div>

        <DenWeeklyTop />
      </aside>
    </div>

    <DenSmartPickModal v-if="showSmart" :model-value="smart" :cats="CATS" :kinds="smartKinds" :sorts="SORTS" :default-currency="smartCurrency"
      @apply="applySmart" @close="showSmart = false" />
    <DenCreateModal v-if="showCreate" :groups="denGroups" :categories="CATS" @close="showCreate = false" @created="published = $event" />
    <DenEditModal v-if="editing" :key="editing.id" :listing="editing" @close="editing = null" />
    <DenBidModal v-if="bidding" :listing="bidding" @close="bidding = null" @placed="flashOk(t.dealersDenConfirmBidBtn)" />
    <DenNsfwModal v-if="showNsfw" @close="showNsfw = false" />
    <DenPublishedModal v-if="published" :title="published.title" :image="published.image" :is-draft="published.isDraft" @open="openPublished" @stay="published = null" />
    <FlashToast :flash="flash" />
  </div>
</template>
