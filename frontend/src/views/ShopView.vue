<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useShopStore, type ShopItem } from '@/stores/shop'
import { useStickersStore } from '@/stores/stickers'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useLangStore } from '@/stores/lang'
import AppHeader  from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon      from '@/components/BIcon.vue'
import StickerPackEditor from '@/components/StickerPackEditor.vue'
import SubmitFrameModal  from '@/components/SubmitFrameModal.vue'
import { isAdmin } from '@/lib/roles'
import { useConfirm } from '@/composables/useConfirm'
import type { StickerPack } from '@/stores/stickers'

const router       = useRouter()
const auth         = useAuthStore()
const shopStore    = useShopStore()
const stickerStore = useStickersStore()
const langStore    = useLangStore()
const { nsfwEnabled } = useNsfwMode()
const { confirmDialog } = useConfirm()

// ── Category ───────────────────────────────────────────────────────────────
type CategoryKey = 'all' | 'theme' | 'background' | 'frame' | 'sticker_pack'
const activeCategory = ref<CategoryKey>('all')

const CATEGORIES: { key: CategoryKey; label: string; icon: string }[] = [
  { key: 'all',          label: 'Все',      icon: 'LayoutGrid' },
  { key: 'sticker_pack', label: 'Стикеры',  icon: 'Smile'      },
  { key: 'theme',        label: 'Темы',      icon: 'Palette'    },
  { key: 'background',   label: 'Фоны',      icon: 'Image'      },
  { key: 'frame',        label: 'Рамки',     icon: 'CircleDot'  },
]

// ── Sort ──────────────────────────────────────────────────────────────────
const SORTS = [
  { key: 'newest',    label: 'Новинки'    },
  { key: 'free',      label: 'Бесплатные' },
  { key: 'price_asc', label: 'Дешевле'   },
]
const selectedSort = ref('newest')

// ── Search ────────────────────────────────────────────────────────────────
const searchQuery = ref('')

// ── Sticker sub-tab ───────────────────────────────────────────────────────
type StickerTab = 'browse' | 'collection' | 'my'
const stickerTab = ref<StickerTab>('browse')

// ── Purchase flash ────────────────────────────────────────────────────────
const purchaseMsg = ref<{ type: 'ok' | 'err'; text: string } | null>(null)
let   flashTimer: ReturnType<typeof setTimeout>

async function acquire(item: ShopItem, e: Event) {
  e.stopPropagation()
  if (!auth.user) { router.push('/login'); return }
  const res = await shopStore.purchaseItem(item.id)
  clearTimeout(flashTimer)
  if (res.ok) {
    purchaseMsg.value = { type: 'ok', text: `«${item.name}» добавлено в коллекцию!` }
  } else {
    purchaseMsg.value = { type: 'err', text: res.error ?? 'Ошибка покупки' }
  }
  flashTimer = setTimeout(() => (purchaseMsg.value = null), 4000)
}

// ── Load ──────────────────────────────────────────────────────────────────
async function loadData() {
  const cat = activeCategory.value
  const promises: Promise<any>[] = []

  if (cat !== 'sticker_pack') {
    promises.push(shopStore.loadItems({ type: cat === 'all' ? undefined : cat }))
  }
  if (cat === 'sticker_pack' || cat === 'all') {
    promises.push(stickerStore.loadPacks())
    if (auth.user) {
      promises.push(stickerStore.loadMyPacks())
      promises.push(stickerStore.loadMyCollection())
    }
  }
  if (auth.user) {
    promises.push(shopStore.loadMyItems())
    promises.push(stickerStore.loadIncomingRequests())
  }

  await Promise.all(promises)
}

watch(activeCategory, loadData)
onMounted(loadData)

// ── Computed ──────────────────────────────────────────────────────────────
const filteredItems = computed<ShopItem[]>(() => {
  let list = shopStore.items
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(i => i.name.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q))
  }
  if (selectedSort.value === 'free')      list = list.filter(i => i.is_free || !Number(i.price))
  if (selectedSort.value === 'price_asc') list = [...list].sort((a, b) => Number(a.price) - Number(b.price))
  return list
})

const displayedStickers = computed(() => {
  if (activeCategory.value === 'sticker_pack') {
    if (stickerTab.value === 'collection') return stickerStore.myCollection
    if (stickerTab.value === 'my')         return stickerStore.myPacks
  }
  return stickerStore.packs
})

const shopStats = computed(() => [
  { icon: 'ShoppingBag', label: 'Товаров',  value: shopStore.total },
  { icon: 'Image',       label: 'Фонов',    value: shopStore.items.filter(i => i.type === 'background').length },
  { icon: 'Palette',     label: 'Тем',      value: shopStore.items.filter(i => i.type === 'theme').length },
  { icon: 'CircleDot',   label: 'Рамок',    value: shopStore.items.filter(i => i.type === 'frame').length },
])

// ── Helpers ───────────────────────────────────────────────────────────────
const TYPE_META: Record<string, {
  label: string; color: string;
  badge: string; hover: string;
  icon: string; from: string; to: string
}> = {
  theme: {
    label: 'Тема',
    color: 'text-brand-purple  bg-brand-purple/15  border-brand-purple/30',
    badge: 'bg-brand-purple/20 border-brand-purple/40 text-brand-purple',
    hover: 'hover:border-brand-purple/50 hover:shadow-brand-purple/10',
    icon: 'Palette', from: '#2D1B4E', to: '#16192F',
  },
  background: {
    label: 'Фон',
    color: 'text-brand-accent  bg-brand-accent/15  border-brand-accent/30',
    badge: 'bg-brand-accent/20 border-brand-accent/40 text-brand-accent',
    hover: 'hover:border-brand-accent/50 hover:shadow-brand-accent/10',
    icon: 'Image', from: '#1A2545', to: '#16192F',
  },
  frame: {
    label: 'Рамка',
    color: 'text-brand-yellow  bg-brand-yellow/15  border-brand-yellow/30',
    badge: 'bg-brand-yellow/20 border-brand-yellow/40 text-brand-yellow',
    hover: 'hover:border-brand-yellow/50 hover:shadow-brand-yellow/10',
    icon: 'CircleDot', from: '#332800', to: '#16192F',
  },
  sticker_pack: {
    label: 'Стикеры',
    color: 'text-brand-pink    bg-brand-pink/15    border-brand-pink/30',
    badge: 'bg-brand-pink/20 border-brand-pink/40 text-brand-pink',
    hover: 'hover:border-brand-pink/50 hover:shadow-brand-pink/10',
    icon: 'Smile', from: '#3D1F30', to: '#16192F',
  },
}

function fmtPrice(item: ShopItem) {
  if (item.is_free || !Number(item.price)) return 'Бесплатно'
  return `${Number(item.price).toFixed(0)} \u20bd`
}

function openPack(pack: any) {
  router.push({ name: 'sticker-pack', params: { id: pack.id } })
}

// ── Создание / редактирование пака ────────────────────────────────────────
const showEditor  = ref(false)
const editingPack = ref<StickerPack | null>(null)

function openCreate() {
  editingPack.value = null
  showEditor.value = true
}

function openEdit(pack: StickerPack) {
  editingPack.value = pack
  showEditor.value = true
}

async function onPackSaved() {
  stickerTab.value = 'my'
  await Promise.all([stickerStore.loadMyPacks(), stickerStore.loadPacks()])
}

async function removePack(pack: StickerPack) {
  if (!(await confirmDialog(`Удалить пак «${pack.name}»?`, { danger: true }))) return
  await stickerStore.deletePack(pack.id)
}

// ── Загрузка рамок (перенесено из Dealers' Den) ─────────────────────────────
// Рамки проходят модерацию: админы публикуют сразу, верифицированные художники уходят в очередь
const canSellFrames = computed(() => {
  const u = auth.user
  if (!u) return false
  return isAdmin(u.role) || (u.is_verified === true && u.verification_type === 'artist')
})
const showFrameModal = ref(false)

function onFrameCreated() {
  clearTimeout(flashTimer)
  purchaseMsg.value = { type: 'ok', text: 'Рамка загружена и отправлена на модерацию' }
  flashTimer = setTimeout(() => (purchaseMsg.value = null), 4000)
}

const deciding = ref<Record<string, boolean>>({})

async function decideRequest(id: string, action: 'approve' | 'reject') {
  deciding.value[id] = true
  try {
    await stickerStore.decideAccessRequest(id, action)
    if (action === 'approve') await stickerStore.loadMyCollection()
  } catch (err: any) {
    alert(err?.response?.data?.error ?? 'Не удалось обработать заявку')
  } finally {
    deciding.value[id] = false
  }
}

const isOwnPack = (pack: StickerPack) => auth.user?.id === pack.author_id

const VISIBILITY_BADGE: Record<string, { label: string; icon: string; cls: string }> = {
  own:    { label: 'Свой',           icon: 'Lock',  cls: 'text-white/70 bg-black/40 border-white/15' },
  invite: { label: 'По приглашению', icon: 'Link2', cls: 'text-sky-300 bg-sky-500/20 border-sky-400/30' },
  paid:   { label: '',               icon: 'Crown', cls: 'text-amber-300 bg-amber-500/20 border-amber-400/30' },
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20 stack-y-5">

        <!-- Top progress bar -->
        <Teleport to="body">
          <transition name="fade-bar">
            <div v-if="shopStore.loading"
              class="fixed top-0 left-0 right-0 z-9999 h-0.5 overflow-hidden"
              style="background: transparent">
              <div class="h-full animate-loading-bar"
                style="background: linear-gradient(90deg,#CD83F5,#4C67CF,#FFC01F,#4C67CF,#CD83F5); background-size: 200%" />
            </div>
          </transition>
        </Teleport>

        <!-- HERO -->
        <div class="relative overflow-hidden rounded-3xl shadow-2xl" style="min-height:190px">
          <div class="absolute inset-0" style="background: linear-gradient(135deg,#1a0a2e 0%,#0f0f1f 45%,#0d1a2e 100%)" />
          <div class="absolute -top-8 -left-8 w-64 h-64 rounded-full opacity-40 blur-3xl"
               style="background: radial-gradient(circle, #CD83F5, transparent)" />
          <div class="absolute -bottom-8 right-20 w-56 h-56 rounded-full opacity-30 blur-3xl"
               style="background: radial-gradient(circle, #4C67CF, transparent)" />
          <div class="absolute top-4 right-4 w-36 h-36 rounded-full opacity-20 blur-2xl"
               style="background: radial-gradient(circle, #FFC01F, transparent)" />

          <div class="absolute top-3 right-12 rotate-12 bg-white/10 backdrop-blur-xs border border-white/20 rounded-xl px-3 py-1.5 hidden md:flex items-center gap-1.5">
            <BIcon name="Palette" class="w-3.5 h-3.5 text-brand-purple" />
            <span class="text-white text-xs font-bold">Темы</span>
          </div>
          <div class="absolute bottom-4 right-6 -rotate-6 bg-white/10 backdrop-blur-xs border border-white/20 rounded-xl px-3 py-1.5 hidden md:flex items-center gap-1.5">
            <BIcon name="CircleDot" class="w-3.5 h-3.5 text-brand-yellow" />
            <span class="text-white text-xs font-bold">Рамки</span>
          </div>
          <div class="absolute top-10 right-44 rotate-2 bg-brand-purple/20 backdrop-blur-xs border border-brand-purple/30 rounded-xl px-3 py-1.5 hidden xl:flex items-center gap-1.5">
            <BIcon name="Image" class="w-3.5 h-3.5 text-brand-accent" />
            <span class="text-white text-xs font-bold">Фоны</span>
          </div>

          <div class="relative z-10 px-6 py-7 md:px-8 max-md:px-4 max-md:py-5">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div class="max-md:min-w-0 max-md:w-full">
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg shrink-0"
                       style="background: linear-gradient(135deg,#CD83F5,#7C3AED)">
                    <BIcon name="ShoppingBag" class="w-6 h-6 text-white" />
                  </div>
                  <div class="max-md:min-w-0">
                    <h1 class="text-3xl max-md:text-2xl font-black tracking-tight"
                        style="background: linear-gradient(90deg, #fff 30%, #CD83F5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text">
                      Bloomly Shop
                    </h1>
                    <p class="text-white/50 text-xs mt-0.5 font-medium">
                      {{ shopStore.loading ? '…' : `${shopStore.total} товаров` }}
                      &nbsp;·&nbsp; официальный магазин сообщества
                    </p>
                  </div>
                </div>
                <p class="text-white/70 text-sm max-w-md leading-relaxed">
                  <span class="text-brand-purple font-semibold">Темы</span>,
                  <span class="text-brand-accent font-semibold">фоны</span>,
                  <span class="text-brand-yellow font-semibold">рамки</span> и
                  <span class="text-brand-pink font-semibold">стикеры</span> —
                  украшай свой профиль и группы в
                  <span class="text-white font-semibold">Bloomly</span>.
                </p>
              </div>

              <div class="flex flex-col gap-2 min-w-[220px] max-md:min-w-0 max-md:w-full">
                <div class="flex items-center gap-2 bg-white/10 backdrop-blur-xs border border-white/15 rounded-2xl px-4 py-2.5">
                  <BIcon name="Search" class="w-4 h-4 text-white/50 shrink-0" />
                  <input v-model="searchQuery"
                    placeholder="Тема, фон, рамка…"
                    class="bg-transparent text-sm text-white placeholder-white/35 outline-hidden w-full" />
                </div>
                <div class="flex items-center gap-1.5 text-xs text-white/40 font-medium px-1">
                  <BIcon name="Shield" class="w-3.5 h-3.5 text-brand-purple" />
                  <span>Официальный магазин Bloomly</span>
                </div>
              </div>
            </div>

            <div class="flex gap-3 mt-5 flex-wrap max-md:grid max-md:grid-cols-2 max-md:gap-2 max-md:mt-4">
              <div v-for="stat in shopStats" :key="stat.label"
                class="flex items-center gap-2 bg-white/8 backdrop-blur-xs border border-white/10 rounded-2xl px-4 py-2 max-md:px-3 max-md:min-w-0">
                <BIcon :name="stat.icon" class="w-3.5 h-3.5 text-brand-purple max-md:shrink-0" />
                <span class="text-white font-extrabold text-sm">{{ stat.value }}</span>
                <span class="text-white/45 text-xs max-md:truncate">{{ stat.label }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- PROMO TILES -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="tile in [
            { key: 'theme',       icon: 'Palette',   label: 'Темы',    sub: 'Смени оформление',    from: '#CD83F5', to: '#7C3AED' },
            { key: 'background',  icon: 'Image',     label: 'Фоны',    sub: 'Для группы и профиля', from: '#4C67CF', to: '#1e40af' },
            { key: 'frame',       icon: 'CircleDot', label: 'Рамки',   sub: 'Укрась свой аватар',   from: '#FFC01F', to: '#d97706' },
            { key: 'sticker_pack',icon: 'Smile',     label: 'Стикеры', sub: 'Паки эмодзи и арт',   from: '#F7A9E2', to: '#db2777' },
          ]" :key="tile.key"
            @click="activeCategory = tile.key as CategoryKey"
            class="relative overflow-hidden rounded-2xl cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
            :class="activeCategory === tile.key ? 'ring-2 ring-white/30' : ''"
            style="height:72px">
            <div class="absolute inset-0" :style="`background: linear-gradient(135deg, ${tile.from}cc, ${tile.to}cc)`" />
            <div class="relative z-10 h-full flex items-center gap-2.5 px-3">
              <BIcon :name="tile.icon" class="w-5 h-5 text-white/90 shrink-0" />
              <div>
                <p class="text-white font-bold text-xs leading-tight">{{ tile.label }}</p>
                <p class="text-white/60 text-[10px]">{{ tile.sub }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- FILTER PILLS + SORT -->
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2 flex-wrap m-scroll-row max-md:-mx-3 max-md:px-3">
            <button v-for="cat in CATEGORIES" :key="cat.key"
              @click="activeCategory = cat.key"
              class="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap"
              :class="activeCategory === cat.key
                ? 'text-white shadow-md shadow-brand-purple/25'
                : 'bg-brand-card border border-brand-border text-white/65 hover:text-white hover:border-white/20'"
              :style="activeCategory === cat.key ? 'background: linear-gradient(135deg,#CD83F5,#7C3AED)' : ''">
              <BIcon :name="cat.icon" class="w-3.5 h-3.5" />
              {{ cat.label }}
              <!-- Заявки на доступ к своим стикерпакам -->
              <span v-if="cat.key === 'sticker_pack' && stickerStore.incomingCount > 0"
                class="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center tabular-nums">
                {{ stickerStore.incomingCount }}
              </span>
            </button>

            <select v-if="activeCategory !== 'sticker_pack'"
              v-model="selectedSort"
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
            ] as const)"
              :key="t.key"
              @click="stickerTab = t.key"
              class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all max-md:flex-1 max-md:px-2 max-md:py-2 max-md:whitespace-nowrap"
              :class="stickerTab === t.key ? 'text-white shadow-md' : 'text-white/50 hover:text-white'"
              :style="stickerTab === t.key ? 'background: linear-gradient(135deg,#CD83F5,#7C3AED)' : ''">
              {{ t.label }}
            </button>
          </div>
            <button @click="openCreate"
              class="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-bold text-white shadow-md shadow-brand-purple/25 hover:opacity-90 transition-all max-md:ml-0 max-md:w-full max-md:justify-center max-md:py-2.5"
              style="background: linear-gradient(135deg,#CD83F5,#7C3AED)">
              <BIcon name="Plus" class="w-4 h-4" /> Добавить стикерпак
            </button>
          </div>
        </div>

        <!-- FLASH TOAST -->
        <Teleport to="body">
          <transition name="slide-up">
            <div v-if="purchaseMsg"
              class="fixed bottom-6 left-1/2 -translate-x-1/2 z-9999 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-xs text-sm font-bold"
              :class="purchaseMsg.type === 'ok'
                ? 'bg-brand-success/20 border-brand-success/30 text-brand-success'
                : 'bg-brand-error/20 border-brand-error/30 text-brand-error'">
              <BIcon :name="purchaseMsg.type === 'ok' ? 'CheckCircle' : 'AlertCircle'" class="w-4 h-4 shrink-0" />
              {{ purchaseMsg.text }}
            </div>
          </transition>
        </Teleport>

        <!-- SECTION HEADER -->
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
            <BIcon :name="CATEGORIES.find(c => c.key === activeCategory)?.icon ?? 'LayoutGrid'" class="w-4 h-4 text-brand-purple" />
            {{ CATEGORIES.find(c => c.key === activeCategory)?.label ?? 'Все' }}
          </h2>
          <span v-if="activeCategory !== 'sticker_pack'" class="text-xs text-white/35 font-medium">
            {{ filteredItems.length }} шт.
          </span>
        </div>

        <!-- SKELETON (shop items) -->
        <div v-if="shopStore.loading && activeCategory !== 'sticker_pack'"
          class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <div v-for="n in 6" :key="n"
            class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden animate-pulse">
            <div class="w-full aspect-4/3 bg-brand-border" />
            <div class="p-3 stack-y-1.5">
              <div class="h-3.5 bg-brand-border rounded-full w-3/4" />
              <div class="h-3 bg-brand-border rounded-full w-1/2" />
            </div>
          </div>
        </div>

        <!-- FRAME UPLOAD -->
        <button v-if="activeCategory === 'frame' && canSellFrames" @click="showFrameModal = true"
          class="w-full flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-2xl transition-all shadow-lg hover:opacity-90 border border-brand-border bg-brand-card">
          <BIcon name="CircleDashed" class="w-4 h-4" /> {{ langStore.t.avatarFrameSubmitBtn }}
        </button>

        <!-- SHOP ITEMS GRID -->
        <template v-if="!shopStore.loading && activeCategory !== 'sticker_pack'">
          <div v-if="filteredItems.length === 0 && activeCategory !== 'all'"
            class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
            <div class="w-20 h-20 bg-brand-bg rounded-full flex items-center justify-center mx-auto mb-5">
              <BIcon name="ShoppingBag" class="w-10 h-10 text-white/20" />
            </div>
            <h3 class="text-lg font-bold text-white mb-2">Товаров пока нет</h3>
            <p class="text-white/35 text-sm">В этой категории скоро появятся новинки</p>
          </div>

          <div v-else-if="filteredItems.length > 0"
            class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <div v-for="item in filteredItems" :key="item.id"
              class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:-translate-y-0.5 transition-all cursor-pointer group shadow-lg"
              :class="TYPE_META[item.type]?.hover ?? 'hover:border-brand-purple/50 hover:shadow-brand-purple/10'">

              <!-- IMAGE AREA 4:3 -->
              <div class="relative w-full overflow-hidden bg-brand-bg" style="aspect-ratio: 4/3">
                <img v-if="item.preview_url" :src="item.preview_url" :alt="item.name"
                  class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                <div v-else class="w-full h-full flex items-center justify-center"
                  :style="`background: linear-gradient(135deg, ${TYPE_META[item.type]?.from ?? '#1F223C'}, ${TYPE_META[item.type]?.to ?? '#16192F'})`">
                  <BIcon :name="TYPE_META[item.type]?.icon ?? 'Image'" class="w-12 h-12 text-white/10" />
                </div>
                <!-- gradient overlay -->
                <div class="absolute inset-0 bg-linear-to-t/srgb from-black/60 via-transparent to-transparent" />

                <!-- Type badge top-left -->
                <span class="absolute top-2 left-2 inline-flex items-center gap-1 border text-[9px] font-extrabold px-2 py-0.5 rounded-full backdrop-blur-xs"
                  :class="TYPE_META[item.type]?.badge ?? 'bg-white/10 border-white/15 text-white/80'">
                  <BIcon :name="TYPE_META[item.type]?.icon ?? 'Tag'" class="w-2.5 h-2.5" />
                  {{ TYPE_META[item.type]?.label ?? item.type }}
                </span>

                <!-- Official badge top-right -->
                <span v-if="item.is_official"
                  class="absolute top-2 right-2 inline-flex items-center gap-1 border text-[9px] font-extrabold px-2 py-0.5 rounded-full backdrop-blur-xs bg-brand-purple/20 border-brand-purple/40 text-brand-purple">
                  <BIcon name="ShieldCheck" class="w-2.5 h-2.5" /> Bloomly
                </span>

                <!-- Free ribbon bottom-left (only when not owned) -->
                <span v-if="!item.owned && (item.is_free || !Number(item.price))"
                  class="absolute bottom-2 left-2 text-[9px] font-extrabold text-brand-success bg-brand-success/20 border border-brand-success/30 px-2 py-0.5 rounded-full backdrop-blur-xs">
                  БЕСПЛАТНО
                </span>

                <!-- Downloads count bottom-right -->
                <span v-if="item.downloads_count" class="absolute bottom-2 right-2 text-[9px] text-white/50 font-bold bg-black/40 backdrop-blur-xs px-2 py-0.5 rounded-full">
                  ↓{{ item.downloads_count }}
                </span>
              </div>

              <!-- INFO SECTION (DealersDen fixed-kind style) -->
              <div class="p-3">
                <div class="flex items-start justify-between gap-2">
                  <!-- Left column: title + desc + tags -->
                  <div class="min-w-0 flex-1">
                    <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ item.name }}</h3>
                    <p v-if="item.description" class="text-[10px] text-white/40 mt-0.5 line-clamp-1">{{ item.description }}</p>
                    <div v-if="item.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
                      <span v-for="tag in item.tags.slice(0, 3)" :key="tag"
                        class="text-[9px] text-white/30 bg-white/5 border border-white/8 px-1.5 py-0.5 rounded-full">
                        {{ tag }}
                      </span>
                    </div>
                  </div>

                  <!-- Right column: price + action -->
                  <div class="shrink-0 flex flex-col items-end gap-1">
                    <span class="text-sm font-black tabular-nums leading-none"
                      :class="item.is_free || !Number(item.price) ? 'text-brand-success' : 'text-brand-yellow'">
                      {{ fmtPrice(item) }}
                    </span>
                    <button v-if="!item.owned"
                      @click="acquire(item, $event)"
                      :disabled="shopStore.purchasing === item.id"
                      class="inline-flex items-center gap-1 text-[9px] font-extrabold px-2.5 py-1 rounded-lg transition-all shadow-md disabled:opacity-50 text-white whitespace-nowrap"
                      :style="item.is_free || !Number(item.price)
                        ? 'background: linear-gradient(135deg,#66C770,#059669)'
                        : 'background: linear-gradient(135deg,#CD83F5,#7C3AED)'">
                      <span v-if="shopStore.purchasing === item.id"
                        class="w-2.5 h-2.5 border border-white border-t-transparent rounded-full animate-spin" />
                      <template v-else>
                        <BIcon :name="item.is_free || !Number(item.price) ? 'Download' : 'ShoppingCart'" class="w-2.5 h-2.5" />
                        {{ item.is_free || !Number(item.price) ? 'Получить' : 'Купить' }}
                      </template>
                    </button>
                    <div v-else class="inline-flex items-center gap-1 text-[9px] font-extrabold text-brand-success">
                      <BIcon name="Check" class="w-2.5 h-2.5" /> Получено
                    </div>
                  </div>
                </div>
              </div>

              <!-- "В коллекции" bottom strip (DealersDen auction-strip style) -->
              <div v-if="item.owned" class="mx-2 mb-2 rounded-xl overflow-hidden"
                style="background: linear-gradient(135deg, rgba(102,199,112,0.08), rgba(5,150,105,0.06)); border: 1px solid rgba(102,199,112,0.18)">
                <div class="px-2.5 py-1.5 flex items-center justify-between">
                  <div class="flex items-center gap-1.5">
                    <BIcon name="CheckCircle" class="w-3 h-3 text-brand-success" />
                    <span class="text-[10px] font-extrabold text-brand-success">В коллекции</span>
                  </div>
                  <span v-if="item.purchased_at" class="text-[9px] text-brand-success/60">
                    {{ new Date(item.purchased_at).toLocaleDateString('ru') }}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </template>

        <!-- STICKER PACKS -->
        <template v-if="activeCategory === 'sticker_pack' || activeCategory === 'all'">
          <!-- Заявки на доступ к стикерпакам по приглашению -->
          <div v-if="stickerTab === 'my' && stickerStore.incomingRequests.length" class="stack-y-2">
            <h3 class="text-sm font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
              <BIcon name="UserPlus" class="w-4 h-4 text-rose-400" />
              Запросы на доступ · {{ stickerStore.incomingCount }}
            </h3>
            <div v-for="r in stickerStore.incomingRequests" :key="r.id"
              class="flex items-center gap-3 bg-brand-card border border-brand-border rounded-2xl p-3">
              <img v-if="r.user.avatar_url" :src="r.user.avatar_url" class="w-9 h-9 rounded-full object-cover shrink-0" />
              <div v-else class="w-9 h-9 rounded-full bg-brand-bg shrink-0" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold text-white truncate">{{ r.user.display_name ?? r.user.username }}
                  <span class="text-white/40 font-normal">хочет получить «{{ r.pack.name }}»</span></p>
                <p class="text-[11px] text-white/35">{{ new Date(r.created_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}</p>
              </div>
              <button @click="decideRequest(r.id, 'reject')" :disabled="deciding[r.id]"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/8 hover:bg-white/15 text-white/70 disabled:opacity-40">Отклонить</button>
              <button @click="decideRequest(r.id, 'approve')" :disabled="deciding[r.id]"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-accent hover:opacity-90 text-white disabled:opacity-40">Одобрить</button>
            </div>
          </div>

          <div v-if="activeCategory === 'all'" class="flex items-center justify-between mt-2">
            <h2 class="text-sm font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
              <BIcon name="Smile" class="w-4 h-4 text-brand-pink" />
              Стикеры
            </h2>
          </div>

          <div v-if="stickerStore.isLoading" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            <div v-for="n in 8" :key="n"
              class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden animate-pulse">
              <div class="w-full bg-brand-border" style="aspect-ratio: 4/3" />
              <div class="p-3 stack-y-1.5">
                <div class="h-3 bg-brand-border rounded-full w-3/4" />
                <div class="h-2.5 bg-brand-border rounded-full w-1/2" />
                <div class="flex gap-1 mt-2">
                  <div class="h-4 w-10 bg-brand-border rounded-full" />
                  <div class="h-4 w-12 bg-brand-border rounded-full" />
                  <div class="h-4 w-8 bg-brand-border rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div v-else-if="displayedStickers.length === 0"
            class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl">
            <div class="w-20 h-20 bg-brand-bg rounded-full flex items-center justify-center mx-auto mb-5">
              <BIcon name="Smile" class="w-10 h-10 text-white/20" />
            </div>
            <h3 class="text-lg font-bold text-white mb-2">
              {{ stickerTab === 'my' ? 'Нет паков' : stickerTab === 'collection' ? 'Коллекция пуста' : 'Паки не найдены' }}
            </h3>
          </div>

          <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
            <div v-for="pack in (activeCategory === 'all' ? displayedStickers.slice(0, 8) : displayedStickers)"
              :key="pack.id"
              @click="openPack(pack)"
              class="group cursor-pointer bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:border-brand-pink/50 hover:-translate-y-0.5 transition-all shadow-lg hover:shadow-brand-pink/10">

              <!-- IMAGE 4:3 -->
              <div class="relative w-full overflow-hidden" style="aspect-ratio: 4/3"
                :style="pack.cover_bg_color ? `background:${pack.cover_bg_color}` : 'background:#1F223C'">
                <!-- Cover image -->
                <img v-if="pack.cover_url" :src="pack.cover_url"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" :alt="pack.name" />
                <!-- No cover: show sticker grid -->
                <div v-else-if="pack.stickers?.length" class="w-full h-full grid grid-cols-2 gap-1.5 p-3 items-center justify-items-center">
                  <img v-for="(st, i) in pack.stickers.slice(0, 4)" :key="i" :src="st"
                    class="w-14 h-14 object-contain drop-shadow-lg group-hover:scale-110 transition-transform duration-300" />
                </div>
                <span v-else class="absolute inset-0 flex items-center justify-center text-5xl select-none
                  group-hover:scale-110 transition-transform duration-300">🐾</span>

                <!-- Gradient bottom -->
                <div class="absolute inset-0 bg-linear-to-t/srgb from-black/75 via-black/10 to-transparent" />

                <!-- Sticker strip overlay bottom (when cover exists) -->
                <div v-if="pack.cover_url && pack.stickers?.length" class="absolute bottom-2 left-2 right-2 flex items-center gap-1.5">
                  <div v-for="(st, i) in pack.stickers.slice(0, 4)" :key="i"
                    class="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-xs border border-white/15 flex items-center justify-center shrink-0 overflow-hidden">
                    <img :src="st" class="w-full h-full object-contain p-0.5" />
                  </div>
                  <div v-if="pack.stickers.length > 4"
                    class="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-xs border border-white/15 flex items-center justify-center shrink-0">
                    <span class="text-[9px] font-extrabold text-white/60">+{{ pack.stickers.length - 4 }}</span>
                  </div>
                </div>

                <!-- Top-left: sticker count badge -->
                <span class="absolute top-2 left-2 inline-flex items-center gap-1 text-[9px] font-extrabold text-brand-pink bg-brand-pink/15 border border-brand-pink/25 px-2 py-0.5 rounded-full backdrop-blur-xs">
                  <BIcon name="Smile" class="w-2.5 h-2.5" /> {{ pack.stickers?.length ?? 0 }} шт.
                </span>

                <!-- Top-right: тип публикации / цена -->
                <span v-if="pack.visibility && VISIBILITY_BADGE[pack.visibility] && !(pack.in_collection)"
                  class="absolute top-2 right-2 inline-flex items-center gap-1 text-[9px] font-extrabold border px-2 py-0.5 rounded-full backdrop-blur-xs"
                  :class="VISIBILITY_BADGE[pack.visibility].cls">
                  <BIcon :name="VISIBILITY_BADGE[pack.visibility].icon" class="w-2.5 h-2.5" />
                  {{ pack.visibility === 'paid' ? `${parseFloat(pack.price)} ${pack.currency}` : VISIBILITY_BADGE[pack.visibility].label }}
                </span>

                <!-- Top-right: in collection -->
                <span v-if="pack.in_collection" class="absolute top-2 right-2 inline-flex items-center gap-1 text-[9px] font-extrabold text-brand-success bg-brand-success/15 border border-brand-success/25 px-2 py-0.5 rounded-full backdrop-blur-xs">
                  <BIcon name="Check" class="w-2.5 h-2.5" /> Есть
                </span>

                <!-- NSFW blur -->
                <div v-if="pack.is_nsfw && !nsfwEnabled"
                  class="absolute inset-0 backdrop-blur-md flex items-center justify-center">
                  <span class="text-xs text-white/60 font-bold bg-black/50 px-2 py-1 rounded-full">18+</span>
                </div>
              </div>

              <!-- INFO -->
              <div class="p-3">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ pack.name }}</h3>
                    <!-- Author micro-row -->
                    <div v-if="pack.author?.username" class="flex items-center gap-1 mt-0.5">
                      <img v-if="pack.author.avatar_url" :src="pack.author.avatar_url"
                        class="w-3.5 h-3.5 rounded-full object-cover border border-brand-pink/20 shrink-0" />
                      <span class="text-[10px] text-brand-pink/70 truncate font-medium">
                        {{ pack.author.display_name ?? pack.author.username }}
                      </span>
                      <BIcon v-if="pack.author.is_verified" name="BadgeCheck" class="w-2.5 h-2.5 text-brand-accent shrink-0" :title="langStore.t.verBadgeGenericLabel" />
                    </div>
                  </div>
                  <!-- Collections count -->
                  <div class="shrink-0 flex items-center gap-0.5 text-[10px] text-white/35 font-bold">
                    <BIcon name="Heart" class="w-2.5 h-2.5" />
                    {{ pack._count?.userCollections ?? 0 }}
                  </div>
                </div>

                <!-- Управление своим паком -->
                <div v-if="isOwnPack(pack)" class="flex gap-1.5 mt-2">
                  <button @click.stop="openEdit(pack)"
                    class="flex-1 inline-flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold bg-white/8 hover:bg-white/15 text-white/80 transition-all">
                    <BIcon name="Pencil" class="w-3 h-3" /> Изменить
                  </button>
                  <button @click.stop="removePack(pack)" title="Удалить"
                    class="w-8 inline-flex items-center justify-center rounded-xl bg-white/8 hover:bg-brand-error/25 text-white/60 hover:text-brand-error transition-all">
                    <BIcon name="Trash2" class="w-3 h-3" />
                  </button>
                </div>

                <!-- Hashtags -->
                <div v-if="pack.tags?.length" class="flex flex-wrap gap-1 mt-1.5">
                  <span v-for="tag in pack.tags.slice(0, 5)" :key="tag"
                    class="text-[9px] text-brand-pink/70 bg-brand-pink/10 border border-brand-pink/20 px-1.5 py-0.5 rounded-full font-bold">
                    #{{ tag }}
                  </span>
                </div>
              </div>

            </div>
          </div>

          <div v-if="activeCategory === 'all' && stickerStore.packs.length > 10" class="text-center">
            <button @click="activeCategory = 'sticker_pack'"
              class="inline-flex items-center gap-1.5 text-sm font-bold text-brand-pink hover:text-white transition-colors">
              Смотреть все стикеры
              <BIcon name="ArrowRight" class="w-4 h-4" />
            </button>
          </div>
        </template>

      </main>
    </div>

    <SubmitFrameModal v-model="showFrameModal" @created="onFrameCreated" />

    <StickerPackEditor v-if="showEditor" :pack="editingPack" @close="showEditor = false" @saved="onPackSaved" />
  </div>
</template>

<style scoped>
@keyframes loading-bar {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}
.animate-loading-bar { animation: loading-bar 1.5s linear infinite; }

.fade-bar-enter-active, .fade-bar-leave-active { transition: opacity 0.3s; }
.fade-bar-enter-from, .fade-bar-leave-to { opacity: 0; }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.35s cubic-bezier(.4,0,.2,1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateX(-50%) translateY(16px); }
</style>
