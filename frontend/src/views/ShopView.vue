<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useShopStore, type ShopItem } from '@/stores/shop'
import { useStickersStore } from '@/stores/stickers'
import { useWalletStore } from '@/stores/wallet'
import { useDealersDenStore, type AvatarFrame } from '@/stores/dealersDen'
import { useLangStore } from '@/stores/lang'
import { apiErrorMessage } from '@/lib/apiError'
import { isAdmin } from '@/lib/roles'
import { useConfirm } from '@/composables/useConfirm'
import api from '@/api'
import AppHeader  from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import WalletCard from '@/components/WalletCard.vue'
import BIcon      from '@/components/BIcon.vue'
import StickerPackEditor from '@/components/StickerPackEditor.vue'
import SubmitFrameModal  from '@/components/SubmitFrameModal.vue'
import ShopItemCard  from '@/components/shop/ShopItemCard.vue'
import ShopFrameCard from '@/components/shop/ShopFrameCard.vue'
import ShopPackCard  from '@/components/shop/ShopPackCard.vue'
import { isFreeItem } from '@/lib/shop'
import type { StickerPack } from '@/stores/stickers'

const router       = useRouter()
const route        = useRoute()
const auth         = useAuthStore()
const shopStore    = useShopStore()
const stickerStore = useStickersStore()
const denStore     = useDealersDenStore()
const walletStore  = useWalletStore()
const langStore    = useLangStore()
const { confirmDialog } = useConfirm()

// ── Category / sort / search ────────────────────────────────────────────────
type CategoryKey = 'all' | 'theme' | 'background' | 'frame' | 'sticker_pack'
const activeCategory = ref<CategoryKey>('all')

const CATEGORIES: { key: CategoryKey; label: string; icon: string; sub: string }[] = [
  { key: 'all',          label: 'Все',      icon: 'LayoutGrid', sub: 'Вся витрина' },
  { key: 'sticker_pack', label: 'Стикеры',  icon: 'Smile',      sub: 'Паки эмодзи и арт' },
  { key: 'theme',        label: 'Темы',     icon: 'Palette',    sub: 'Смени оформление' },
  { key: 'background',   label: 'Фоны',     icon: 'Image',      sub: 'Для группы и профиля' },
  { key: 'frame',        label: 'Рамки',    icon: 'CircleDot',  sub: 'Укрась свой аватар' },
]
const activeMeta = computed(() => CATEGORIES.find(c => c.key === activeCategory.value) ?? CATEGORIES[0])

const SORTS = [
  { key: 'newest',    label: 'Новинки'    },
  { key: 'free',      label: 'Бесплатные' },
  { key: 'price_asc', label: 'Дешевле'    },
]
const selectedSort = ref('newest')
const searchQuery  = ref('')

type StickerTab = 'browse' | 'collection' | 'my'
const stickerTab = ref<StickerTab>('browse')

// ── Flash ───────────────────────────────────────────────────────────────────
const flash = ref<{ type: 'ok' | 'err'; text: string } | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | undefined

function showFlash(type: 'ok' | 'err', text: string) {
  clearTimeout(flashTimer)
  flash.value = { type, text }
  flashTimer = setTimeout(() => (flash.value = null), 4000)
}

// ── Покупка товара ────────────────────────────────────────────────────────────
async function acquire(item: ShopItem) {
  if (!auth.user) { router.push('/login'); return }
  const res = await shopStore.purchaseItem(item.id)
  if (res.ok) {
    showFlash('ok', `«${item.name}» добавлено в коллекцию!`)
    walletStore.fetchBalance()
  } else {
    showFlash('err', res.error ?? 'Ошибка покупки')
  }
}

// ── Рамки аватара ─────────────────────────────────────────────────────────────
type FrameRow = AvatarFrame & { owned: boolean }
const frames          = ref<FrameRow[]>([])
const claimingFrameId = ref<string | null>(null)
const equippingFrameId = ref<string | null>(null)
const equippedFrameId = ref<string | null>((auth.user as { profile_frame_id?: string | null } | null)?.profile_frame_id ?? null)

async function loadFrames() {
  if (!auth.user) { frames.value = []; return }
  try { frames.value = await denStore.listAvatarFrames() } catch { frames.value = [] }
}

async function claimFrame(f: AvatarFrame) {
  if (!auth.user) { router.push('/login'); return }
  if (claimingFrameId.value) return
  claimingFrameId.value = f.id
  try {
    await denStore.claimAvatarFrame(f.id)
    const row = frames.value.find(x => x.id === f.id)
    if (row) row.owned = true
    showFlash('ok', `Рамка «${f.name}» теперь у вас`)
    if (Number(f.price) > 0) walletStore.fetchBalance()
  } catch (e) {
    showFlash('err', apiErrorMessage(e) ?? 'Не удалось забрать рамку')
  } finally {
    claimingFrameId.value = null
  }
}

async function equipFrame(f: AvatarFrame) {
  if (equippingFrameId.value) return
  equippingFrameId.value = f.id
  try {
    await api.patch('/users/me', { profile_frame_id: f.id, profile_frame: null })
    equippedFrameId.value = f.id
    showFlash('ok', `Рамка «${f.name}» надета на аватар`)
  } catch (e) {
    showFlash('err', apiErrorMessage(e) ?? 'Не удалось надеть рамку')
  } finally {
    equippingFrameId.value = null
  }
}

// ── Загрузка ────────────────────────────────────────────────────────────────
const wantsItems    = computed(() => activeCategory.value !== 'sticker_pack')
const wantsFrames   = computed(() => activeCategory.value === 'frame' || activeCategory.value === 'all')
const wantsStickers = computed(() => activeCategory.value === 'sticker_pack' || activeCategory.value === 'all')

function loadCatalog() {
  const tasks: Promise<unknown>[] = []
  if (wantsItems.value) {
    tasks.push(shopStore.loadItems({
      type: activeCategory.value, q: searchQuery.value, sort: selectedSort.value,
    }))
  }
  if (wantsStickers.value) tasks.push(stickerStore.loadPacks())
  if (wantsFrames.value) tasks.push(loadFrames())
  return Promise.all(tasks)
}

/** Данные пользователя не зависят от вкладки — грузим один раз, а не при каждом переключении. */
function loadUserData() {
  if (!auth.user) return Promise.resolve()
  return Promise.all([
    shopStore.loadMyItems(),
    stickerStore.loadMyPacks(),
    stickerStore.loadMyCollection(),
    stickerStore.loadIncomingRequests(),
  ])
}

watch(activeCategory, loadCatalog)
watch(selectedSort, loadCatalog)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(searchQuery, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { if (wantsItems.value) loadCatalog() }, 300)
})
onBeforeUnmount(() => { clearTimeout(searchTimer); clearTimeout(flashTimer) })

onMounted(async () => {
  await Promise.all([loadCatalog(), loadUserData()])
  // «Управление» на странице пака приходит сюда с ?edit=<id>: сразу открываем редактор этого пака
  const editId = typeof route.query.edit === 'string' ? route.query.edit : ''
  if (!editId) return
  const target = stickerStore.myPacks?.find((p: StickerPack) => p.id === editId)
  if (target) openEdit(target)
  router.replace({ name: 'shop', query: { ...route.query, edit: undefined } })
})

// ── Что показываем ──────────────────────────────────────────────────────────
const needle = computed(() => searchQuery.value.trim().toLowerCase())
const matches = (...parts: (string | null | undefined)[]) => !needle.value || parts.some(p => (p ?? '').toLowerCase().includes(needle.value))

// Рамки и паки приходят целиком, поэтому поиск и сортировку для них делаем здесь
const visibleFrames = computed(() => {
  let list = frames.value.filter(f => matches(f.name, f.creator.display_name, f.creator.username))
  if (selectedSort.value === 'free')      list = list.filter(f => !Number(f.price))
  if (selectedSort.value === 'price_asc') list = [...list].sort((a, b) => Number(a.price) - Number(b.price))
  return list
})

const displayedStickers = computed(() => {
  const base = activeCategory.value === 'sticker_pack' && stickerTab.value === 'collection' ? stickerStore.myCollection
             : activeCategory.value === 'sticker_pack' && stickerTab.value === 'my'         ? stickerStore.myPacks
             : stickerStore.packs
  return base.filter((p: StickerPack) => matches(p.name, ...(p.tags ?? [])))
})
const shownStickers = computed(() => activeCategory.value === 'all' ? displayedStickers.value.slice(0, 8) : displayedStickers.value)

const shopStats = computed(() => [
  { icon: 'ShoppingBag', label: 'Товаров',     value: shopStore.total + frames.value.length },
  { icon: 'CircleDot',   label: 'Рамок',       value: frames.value.length },
  { icon: 'Smile',       label: 'Стикерпаков', value: stickerStore.packs.length },
  { icon: 'Heart',       label: 'У вас',       value: shopStore.myItems.length + frames.value.filter(f => f.owned).length },
])

const hasAnything = computed(() =>
  shopStore.items.length > 0
  || (wantsFrames.value && visibleFrames.value.length > 0)
  || (wantsStickers.value && displayedStickers.value.length > 0))
const initialLoading = computed(() =>
  (wantsItems.value && shopStore.loading) || (wantsStickers.value && stickerStore.isLoading))

// ── Стикерпаки ────────────────────────────────────────────────────────────────
const showEditor  = ref(false)
const editingPack = ref<StickerPack | null>(null)

function openPack(pack: StickerPack) { router.push({ name: 'sticker-pack', params: { id: pack.id } }) }
function openCreate() { editingPack.value = null; showEditor.value = true }
function openEdit(pack: StickerPack) { editingPack.value = pack; showEditor.value = true }

async function onPackSaved() {
  stickerTab.value = 'my'
  await Promise.all([stickerStore.loadMyPacks(), stickerStore.loadPacks()])
}

async function removePack(pack: StickerPack) {
  if (!(await confirmDialog(`Удалить пак «${pack.name}»?`, { danger: true }))) return
  await stickerStore.deletePack(pack.id)
}

const isOwnPack = (pack: StickerPack) => auth.user?.id === pack.author_id

const deciding = ref<Record<string, boolean>>({})

async function decideRequest(id: string, action: 'approve' | 'reject') {
  deciding.value[id] = true
  try {
    await stickerStore.decideAccessRequest(id, action)
    if (action === 'approve') await stickerStore.loadMyCollection()
  } catch (e) {
    showFlash('err', apiErrorMessage(e) ?? 'Не удалось обработать заявку')
  } finally {
    deciding.value[id] = false
  }
}

// ── Загрузка рамок: админы публикуют сразу, верифицированные художники уходят в модерацию ──
const canSellFrames = computed(() => {
  const u = auth.user
  return !!u && (isAdmin(u.role) || (u.is_verified === true && u.verification_type === 'artist'))
})
const showFrameModal = ref(false)

function onFrameCreated() {
  loadFrames()
  showFlash('ok', 'Рамка загружена и отправлена на модерацию')
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20 stack-y-5">

        <!-- HERO -->
        <div class="relative overflow-hidden rounded-3xl shadow-2xl bg-linear-to-br from-brand-purple/20 via-brand-bg to-brand-accent/20 border border-brand-border">
          <div class="absolute -top-10 -left-10 w-64 h-64 rounded-full bg-brand-purple/30 blur-3xl pointer-events-none" />
          <div class="absolute -bottom-10 right-16 w-56 h-56 rounded-full bg-brand-accent/25 blur-3xl pointer-events-none" />
          <div class="absolute top-4 right-4 w-36 h-36 rounded-full bg-brand-yellow/15 blur-2xl pointer-events-none" />

          <div class="relative z-10 px-6 py-7 max-md:px-4 max-md:py-5">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div class="max-md:w-full">
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-12 h-12 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-lg shrink-0">
                    <BIcon name="ShoppingBag" class="w-6 h-6 text-white" />
                  </div>
                  <div class="min-w-0">
                    <h1 class="text-3xl max-md:text-2xl font-black tracking-tight">Bloomly Shop</h1>
                    <p class="text-white/50 text-xs mt-0.5 font-medium">официальный магазин сообщества</p>
                  </div>
                </div>
                <p class="text-white/70 text-sm max-w-md leading-relaxed">
                  <span class="text-brand-purple font-semibold">Темы</span>,
                  <span class="text-brand-accent-minus font-semibold">фоны</span>,
                  <span class="text-brand-yellow font-semibold">рамки</span> и
                  <span class="text-brand-pink font-semibold">стикеры</span> —
                  украшай свой профиль и группы в <span class="text-white font-semibold">Bloomly</span>.
                </p>
              </div>

              <div class="flex flex-col gap-2 min-w-[220px] max-md:min-w-0 max-md:w-full">
                <WalletCard v-if="auth.user" />
                <label class="flex items-center gap-2 bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl px-4 py-2.5">
                  <BIcon name="Search" class="w-4 h-4 text-white/50 shrink-0" />
                  <input v-model="searchQuery" placeholder="Тема, фон, рамка, стикеры…"
                    class="bg-transparent text-sm text-white placeholder-white/35 outline-hidden w-full" />
                  <button v-if="searchQuery" type="button" @click="searchQuery = ''" class="text-white/40 hover:text-white">
                    <BIcon name="X" class="w-3.5 h-3.5" />
                  </button>
                </label>
              </div>
            </div>

            <div class="grid grid-cols-2 md:flex gap-2 md:gap-3 mt-5">
              <div v-for="stat in shopStats" :key="stat.label"
                class="flex items-center gap-2 bg-white/8 backdrop-blur-xs border border-white/10 rounded-2xl px-4 py-2 max-md:px-3 min-w-0">
                <BIcon :name="stat.icon" class="w-3.5 h-3.5 text-brand-purple shrink-0" />
                <span class="text-white font-extrabold text-sm tabular-nums">{{ stat.value }}</span>
                <span class="text-white/45 text-xs truncate">{{ stat.label }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- CATEGORIES + SORT -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2 flex-wrap m-scroll-row max-md:-mx-3 max-md:px-3">
            <button v-for="cat in CATEGORIES" :key="cat.key" @click="activeCategory = cat.key" :title="cat.sub"
              class="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap"
              :class="activeCategory === cat.key
                ? 'text-white shadow-md shadow-brand-accent/25 bg-brand-gradient'
                : 'bg-brand-card border border-brand-border text-white/65 hover:text-white hover:border-white/20'">
              <BIcon :name="cat.icon" class="w-3.5 h-3.5" />
              {{ cat.label }}
              <span v-if="cat.key === 'sticker_pack' && stickerStore.incomingCount > 0"
                class="min-w-5 h-5 px-1.5 rounded-full bg-brand-error text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                {{ stickerStore.incomingCount }}
              </span>
            </button>

            <select v-if="wantsItems || activeCategory === 'frame'" v-model="selectedSort"
              class="ml-auto bg-brand-card border border-brand-border rounded-full px-3.5 py-2 text-sm text-white/60 outline-hidden appearance-none cursor-pointer shrink-0">
              <option v-for="s in SORTS" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
          </div>

          <div v-if="activeCategory === 'sticker_pack' && auth.user" class="flex flex-wrap items-center gap-3">
            <div class="flex gap-1 self-start bg-brand-card rounded-2xl p-1 border border-brand-border max-md:w-full">
              <button v-for="t in ([
                { key: 'browse', label: 'Все паки' },
                { key: 'collection', label: 'Коллекция' },
                { key: 'my', label: 'Мои паки' },
              ] as const)" :key="t.key" @click="stickerTab = t.key"
                class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all max-md:flex-1 max-md:px-2 max-md:py-2 max-md:whitespace-nowrap"
                :class="stickerTab === t.key ? 'text-white shadow-md bg-brand-gradient' : 'text-white/50 hover:text-white'">
                {{ t.label }}
              </button>
            </div>
            <button @click="openCreate"
              class="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-bold text-white shadow-md shadow-brand-accent/25 hover:opacity-90 transition-opacity bg-brand-gradient max-md:ml-0 max-md:w-full max-md:justify-center">
              <BIcon name="Plus" class="w-4 h-4" /> Добавить стикерпак
            </button>
          </div>
        </div>

        <!-- FLASH -->
        <Teleport to="body">
          <transition name="slide-up">
            <div v-if="flash"
              class="fixed bottom-6 left-1/2 -translate-x-1/2 z-9999 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xs text-sm font-bold max-w-[92vw]"
              :class="flash.type === 'ok'
                ? 'bg-brand-success/20 border-brand-success/30 text-brand-success'
                : 'bg-brand-error/20 border-brand-error/30 text-brand-error'">
              <BIcon :name="flash.type === 'ok' ? 'CheckCircle' : 'AlertCircle'" class="w-4 h-4 shrink-0" />
              {{ flash.text }}
            </div>
          </transition>
        </Teleport>

        <!-- SKELETON -->
        <div v-if="initialLoading" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
          <div v-for="n in 8" :key="n" class="card-surface animate-pulse">
            <div class="w-full bg-brand-border aspect-4/3" />
            <div class="p-3 stack-y-1.5">
              <div class="h-3.5 bg-brand-border rounded-full w-3/4" />
              <div class="h-3 bg-brand-border rounded-full w-1/2" />
            </div>
          </div>
        </div>

        <template v-else>
          <!-- FRAMES (примерочная) -->
          <section v-if="wantsFrames && (visibleFrames.length || canSellFrames)" class="stack-y-3">
            <div class="flex items-center justify-between gap-3">
              <h2 class="section-title"><BIcon name="CircleDot" class="w-4 h-4 text-brand-yellow" /> Рамки · примерочная</h2>
              <button v-if="canSellFrames" @click="showFrameModal = true"
                class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold text-white card-surface hover:border-white/25 transition-colors">
                <BIcon name="CircleDashed" class="w-4 h-4" /> {{ langStore.t.avatarFrameSubmitBtn }}
              </button>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              <ShopFrameCard v-for="f in visibleFrames" :key="f.id" :frame="f"
                :busy="claimingFrameId === f.id" :equipped="equippedFrameId === f.id" :equipping="equippingFrameId === f.id"
                @claim="claimFrame" @equip="equipFrame" />
            </div>
          </section>

          <!-- SHOP ITEMS -->
          <section v-if="wantsItems && shopStore.items.length" class="stack-y-3">
            <div class="flex items-center justify-between">
              <h2 class="section-title"><BIcon :name="activeMeta.icon" class="w-4 h-4 text-brand-purple" /> {{ activeCategory === 'all' ? 'Темы и фоны' : activeMeta.label }}</h2>
              <span class="text-xs text-white/35 font-medium">{{ shopStore.items.length }} из {{ shopStore.total }}</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              <ShopItemCard v-for="item in shopStore.items" :key="item.id" :item="item"
                :busy="shopStore.purchasing === item.id" @acquire="acquire" />
            </div>
            <div v-if="shopStore.hasMore" class="text-center">
              <button @click="shopStore.loadItems({ type: activeCategory, q: searchQuery, sort: selectedSort, append: true })"
                :disabled="shopStore.loadingMore"
                class="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold card-surface hover:border-white/25 transition-colors disabled:opacity-50">
                <span v-if="shopStore.loadingMore" class="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Показать ещё
              </button>
            </div>
          </section>

          <!-- STICKER PACKS -->
          <section v-if="wantsStickers" class="stack-y-3">
            <div v-if="stickerTab === 'my' && stickerStore.incomingRequests.length" class="stack-y-2">
              <h3 class="section-title"><BIcon name="UserPlus" class="w-4 h-4 text-brand-error" /> Запросы на доступ · {{ stickerStore.incomingCount }}</h3>
              <div v-for="r in stickerStore.incomingRequests" :key="r.id" class="card-surface flex items-center gap-3 p-3">
                <img v-if="r.user.avatar_url" :src="r.user.avatar_url" class="w-9 h-9 rounded-full object-cover shrink-0" />
                <div v-else class="w-9 h-9 rounded-full bg-brand-bg shrink-0" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold text-white truncate">{{ r.user.display_name ?? r.user.username }}
                    <span class="text-white/40 font-normal">хочет получить «{{ r.pack.name }}»</span></p>
                  <p class="text-[11px] text-white/35">{{ fmtDate(r.created_at) }}</p>
                </div>
                <button @click="decideRequest(r.id, 'reject')" :disabled="deciding[r.id]"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/8 hover:bg-white/15 text-white/70 disabled:opacity-40">Отклонить</button>
                <button @click="decideRequest(r.id, 'approve')" :disabled="deciding[r.id]"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-accent hover:opacity-90 text-white disabled:opacity-40">Одобрить</button>
              </div>
            </div>

            <h2 v-if="activeCategory === 'all' && shownStickers.length" class="section-title">
              <BIcon name="Smile" class="w-4 h-4 text-brand-pink" /> Стикеры
            </h2>

            <div v-if="displayedStickers.length" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              <ShopPackCard v-for="pack in shownStickers" :key="pack.id" :pack="pack" :own="isOwnPack(pack)"
                @open="openPack(pack)" @edit="openEdit(pack)" @remove="removePack(pack)" />
            </div>
            <div v-else-if="activeCategory === 'sticker_pack'" class="card-surface text-center py-16 rounded-3xl">
              <BIcon name="Smile" class="w-10 h-10 text-white/20 mx-auto mb-4" />
              <h3 class="text-lg font-bold text-white">
                {{ needle ? 'Ничего не найдено' : stickerTab === 'my' ? 'Нет паков' : stickerTab === 'collection' ? 'Коллекция пуста' : 'Паки не найдены' }}
              </h3>
            </div>

            <div v-if="activeCategory === 'all' && displayedStickers.length > 8" class="text-center">
              <button @click="activeCategory = 'sticker_pack'"
                class="inline-flex items-center gap-1.5 text-sm font-bold text-brand-pink hover:text-white transition-colors">
                Смотреть все стикеры <BIcon name="ArrowRight" class="w-4 h-4" />
              </button>
            </div>
          </section>

          <!-- EMPTY -->
          <div v-if="!hasAnything && activeCategory !== 'sticker_pack'" class="card-surface text-center py-20 rounded-3xl">
            <BIcon name="ShoppingBag" class="w-10 h-10 text-white/20 mx-auto mb-4" />
            <h3 class="text-lg font-bold text-white mb-1">{{ needle ? 'Ничего не найдено' : 'Товаров пока нет' }}</h3>
            <p class="text-white/35 text-sm">{{ needle ? 'Попробуйте другой запрос' : 'В этой категории скоро появятся новинки' }}</p>
          </div>
        </template>

      </main>
    </div>

    <SubmitFrameModal v-model="showFrameModal" @created="onFrameCreated" />
    <StickerPackEditor v-if="showEditor" :pack="editingPack" @close="showEditor = false" @saved="onPackSaved" />
  </div>
</template>

<style scoped>
.slide-up-enter-active, .slide-up-leave-active { transition: all 0.35s cubic-bezier(.4,0,.2,1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateX(-50%) translateY(16px); }
</style>
