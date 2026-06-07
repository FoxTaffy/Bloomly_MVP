<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useStickersStore, type StickerPack, type CreatePackInput } from '@/stores/stickers'
import { useNsfwMode } from '@/composables/useNsfwMode'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import StickerUpload from '@/components/StickerUpload.vue'
import TelegramImportModal from '@/components/TelegramImportModal.vue'
import StickerImg from '@/components/StickerImg.vue'

const router = useRouter()
const auth   = useAuthStore()
const store  = useStickersStore()
const { nsfwEnabled, enableNsfw } = useNsfwMode()

// ── Tabs / filter ────────────────────────────────────────────────────────────
type MainTab = 'browse' | 'collection' | 'my'
const activeTab = ref<MainTab>('browse')

type FilterKey = 'all' | 'popular' | 'new' | 'animated' | 'nsfw' | 'free'
const activeFilter = ref<FilterKey>('all')
const showNsfwConfirm = ref(false)

function openPack(pack: any) {
  if (pack.is_nsfw && !nsfwEnabled.value) {
    showNsfwConfirm.value = true
    return
  }
  router.push({ name: 'sticker-pack', params: { id: pack.id } })
}
const searchQuery = ref('')

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'Все стикеры' },
  { key: 'popular',  label: 'Популярные' },
  { key: 'new',      label: 'Новинки' },
  { key: 'animated', label: 'Анимированные' },
  { key: 'nsfw',     label: 'NSFW' },
  { key: 'free',     label: 'Бесплатные' },
]

const displayPacks = computed(() => {
  if (activeTab.value === 'collection') return store.myCollection
  if (activeTab.value === 'my')         return store.myPacks
  return store.packs
})

const sectionTitle = computed(() => {
  if (activeTab.value === 'collection') return 'Моя коллекция'
  if (activeTab.value === 'my') return 'Мои паки'
  if (activeFilter.value === 'popular') return 'Популярные коллекции'
  if (activeFilter.value === 'new') return 'Новые паки'
  if (activeFilter.value === 'animated') return 'Анимированные стикеры'
  if (activeFilter.value === 'nsfw') return 'NSFW'
  if (activeFilter.value === 'free') return 'Бесплатные паки'
  return 'Популярные коллекции'
})

const sectionSubtitle = computed(() => {
  if (activeTab.value !== 'browse') return ''
  if (activeFilter.value === 'all' || activeFilter.value === 'popular') return 'Выбор сообщества'
  return `${store.total} паков`
})

async function loadData() {
  const params: Record<string, any> = { search: searchQuery.value || undefined }
  if (activeFilter.value === 'free')     params.free = '1'
  if (activeFilter.value === 'nsfw')     params.nsfw = '1'
  if (activeFilter.value === 'animated') params.tag = 'animated'
  if (activeFilter.value === 'popular')  params.sort = 'popular'
  if (activeFilter.value === 'new')      params.sort = 'new'
  const promises: Promise<any>[] = [ store.loadPacks(params) ]
  if (auth.user) {
    promises.push(store.loadMyPacks())
    promises.push(store.loadMyCollection())
  }
  await Promise.all(promises)
}

// Перезагрузить при смене NSFW-режима
watch(nsfwEnabled, () => {
  if (activeTab.value === 'browse') loadData()
})

function setFilter(f: FilterKey) {
  activeFilter.value = f
  activeTab.value = 'browse'
  loadData()
}

// ── Banner carousel ───────────────────────────────────────────────────────────
const heroBanners = ref<any[]>([])
const heroCurrent = ref(0)
let heroTimer: ReturnType<typeof setInterval> | null = null

const fetchHeroBanners = async () => {
  try {
    const res = await api.get('/admin/sticker-banners/active')
    if (res.data.success) {
      heroBanners.value = res.data.data
      if (heroBanners.value.length > 1) {
        heroTimer = setInterval(() => {
          heroCurrent.value = (heroCurrent.value + 1) % heroBanners.value.length
        }, 5000)
      }
    }
  } catch {}
}

const heroPrev = () => {
  heroCurrent.value = (heroCurrent.value - 1 + heroBanners.value.length) % heroBanners.value.length
  resetHeroTimer()
}
const heroNext = () => {
  heroCurrent.value = (heroCurrent.value + 1) % heroBanners.value.length
  resetHeroTimer()
}
const heroGoto = (i: number) => { heroCurrent.value = i; resetHeroTimer() }
const resetHeroTimer = () => {
  if (heroTimer) clearInterval(heroTimer)
  if (heroBanners.value.length > 1) {
    heroTimer = setInterval(() => {
      heroCurrent.value = (heroCurrent.value + 1) % heroBanners.value.length
    }, 5000)
  }
}

onMounted(async () => {
  await fetchHeroBanners()
  loadData()
})

onUnmounted(() => { if (heroTimer) clearInterval(heroTimer) })

// ── Create / Edit pack wizard ─────────────────────────────────────────────────
type WizardStep = 'stickers' | 'info' | 'cover'
const showCreateModal   = ref(false)
const showTelegramModal = ref(false)
const isCreating        = ref(false)
const wizardStep        = ref<WizardStep>('stickers')
const editingPackId     = ref<string | null>(null)

const COVER_COLORS = [
  '#1a1a2e', '#16213e', '#0f3460', '#533483',
  '#7B2D8B', '#C84B31', '#E26A2C', '#F5A623',
  '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6',
  '#E91E63', '#FF5722', '#607D8B', '#2C3E50',
]

const form = ref({
  name:            '',
  description:     '',
  price:           0,
  currency:        'RUB',
  isNsfw:          false,
  hideAuthor:      false,
  tags:            '',
  status:          'published' as 'published' | 'draft',
  coverUrl:        '',
  coverBgColor:    '#1a1a2e',
  coverStickerIdx: null as number | null,
  stickers:        [] as string[],
  nsfwStickers:    [] as number[],
})

function resetForm() {
  form.value = {
    name: '', description: '', price: 0, currency: 'RUB', isNsfw: false, hideAuthor: false,
    tags: '', status: 'published', coverUrl: '', coverBgColor: '#1a1a2e',
    coverStickerIdx: null, stickers: [], nsfwStickers: [],
  }
  wizardStep.value = 'stickers'
  editingPackId.value = null
}

function tryCloseWizard() {
  const f = form.value
  const dirty = f.stickers.length > 0 || f.name.trim() !== '' || f.description.trim() !== ''
  if (dirty && !window.confirm('Форма не сохранена. Закрыть без сохранения?')) return
  showCreateModal.value = false
}

function openCreateModal() {
  resetForm()
  showCreateModal.value = true
}

function openEdit(pack: StickerPack) {
  resetForm()
  editingPackId.value = pack.id
  form.value = {
    name:            pack.name,
    description:     pack.description ?? '',
    price:           parseFloat(pack.price),
    currency:        pack.currency,
    isNsfw:          pack.is_nsfw,
    hideAuthor:      pack.hide_author ?? false,
    tags:            pack.tags.join(', '),
    status:          pack.status,
    coverUrl:        pack.cover_url ?? '',
    coverBgColor:    pack.cover_bg_color ?? '#1a1a2e',
    coverStickerIdx: pack.cover_sticker_idx ?? null,
    stickers:        [...pack.stickers],
    nsfwStickers:    [...(pack.nsfw_stickers ?? [])],
  }
  wizardStep.value = 'stickers'
  showCreateModal.value = true
}

function toggleStickerNsfw(idx: number) {
  const i = form.value.nsfwStickers.indexOf(idx)
  if (i === -1) form.value.nsfwStickers.push(idx)
  else form.value.nsfwStickers.splice(i, 1)
}

function removeSticker(idx: number) {
  form.value.stickers.splice(idx, 1)
  form.value.nsfwStickers = form.value.nsfwStickers
    .filter(n => n !== idx)
    .map(n => n > idx ? n - 1 : n)
  if (form.value.coverStickerIdx === idx) form.value.coverStickerIdx = null
  else if (form.value.coverStickerIdx !== null && form.value.coverStickerIdx > idx)
    form.value.coverStickerIdx--
}

// Computed cover preview style
const coverPreviewStyle = computed(() => {
  if (form.value.coverUrl) return {}
  return { background: form.value.coverBgColor }
})

// Hero sticker for cover
const heroStickerUrl = computed(() => {
  if (form.value.coverStickerIdx === null) return null
  return form.value.stickers[form.value.coverStickerIdx] ?? null
})

function handleTelegramImport(payload: { title: string; tg_name: string; sticker_urls: string[] }) {
  resetForm()
  form.value.name        = payload.title
  form.value.description = `Импортировано из Telegram (@${payload.tg_name})`
  form.value.tags        = payload.tg_name
  form.value.stickers    = payload.sticker_urls
  if (payload.sticker_urls.length) form.value.coverStickerIdx = 0
  wizardStep.value = 'stickers'
  showCreateModal.value = true
}

async function submitCreate() {
  if (!form.value.name.trim()) { wizardStep.value = 'info'; return }
  isCreating.value = true
  try {
    const payload = {
      name:            form.value.name.trim(),
      description:     form.value.description.trim() || undefined,
      price:           form.value.price,
      currency:        form.value.currency,
      isNsfw:          form.value.isNsfw,
      hideAuthor:      form.value.hideAuthor,
      tags:            form.value.tags.split(',').map(t => t.trim()).filter(Boolean),
      status:          form.value.status,
      coverUrl:        form.value.coverUrl || undefined,
      coverBgColor:    form.value.coverBgColor || undefined,
      coverStickerIdx: form.value.coverStickerIdx,
      stickers:        form.value.stickers,
      nsfwStickers:    form.value.nsfwStickers,
    }
    if (editingPackId.value) {
      await store.updatePack(editingPackId.value, payload)
    } else {
      await store.createPack(payload)
      activeTab.value = 'my'
    }
    showCreateModal.value = false
  } finally {
    isCreating.value = false
  }
}

async function deletePack(id: string) {
  if (!confirm('Удалить пак стикеров?')) return
  await store.deletePack(id)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const CURRENCIES = ['RUB', 'USD', 'EUR', 'GBP']

function isOwn(pack: StickerPack) {
  return auth.user?.id === pack.author_id
}

function inCollection(pack: StickerPack) {
  return store.myCollection.some(p => p.id === pack.id)
}

async function toggleCollection(pack: StickerPack) {
  if (!auth.user) return
  if (inCollection(pack)) {
    await store.removeFromCollection(pack.id)
  } else {
    await store.addToCollection(pack.id)
  }
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">
      <AppSidebar />

      <main class="flex-1 min-w-0 pb-28 md:pb-20 space-y-5">

        <!-- ── Загрузка страницы (top progress bar) ─────────── -->
        <Teleport to="body">
          <transition name="fade-bar">
            <div v-if="store.isLoading"
              class="fixed top-0 left-0 right-0 z-[9999] h-0.5 overflow-hidden"
              style="background: transparent">
              <div class="h-full animate-loading-bar"
                style="background: linear-gradient(90deg, #7B2D8B, #5B2EFF, #2AABEE, #5B2EFF, #7B2D8B); background-size: 200%"></div>
            </div>
          </transition>
        </Teleport>

        <!-- ═══════════════════════════════════════════
             HERO — красивый статичный + admin-карусель
        ════════════════════════════════════════════ -->

        <!-- Admin carousel (если есть баннеры от администратора) -->
        <div v-if="heroBanners.length > 0" class="relative rounded-3xl overflow-hidden shadow-2xl select-none" style="height:220px">
          <transition-group name="hero-slide" tag="div" class="absolute inset-0">
            <div v-for="(b, i) in heroBanners" :key="b.id" v-show="heroCurrent === i" class="absolute inset-0 w-full h-full">
              <img v-if="b.image_url" :src="b.image_url" class="absolute inset-0 w-full h-full object-cover" :alt="b.title" />
              <div class="absolute inset-0" :style="b.gradient ? `background: ${b.gradient}` : 'background: linear-gradient(135deg, #5B2EFF 0%, #2C1780 100%)'"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>
              <div class="absolute inset-0 p-5 flex flex-col justify-between">
                <div>
                  <span v-if="b.tag_label" class="inline-block text-xs font-extrabold px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white border border-white/20 mb-2">{{ b.tag_label }}</span>
                </div>
                <div>
                  <h2 class="text-white font-black text-xl md:text-2xl leading-tight drop-shadow-lg mb-1">{{ b.title }}</h2>
                  <p v-if="b.subtitle" class="text-white/80 text-sm leading-snug drop-shadow mb-3 max-w-sm">{{ b.subtitle }}</p>
                  <div class="flex items-center gap-3 flex-wrap">
                    <a v-if="b.link_url" :href="b.link_url" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-white text-black text-sm font-extrabold hover:bg-white/90 transition-all shadow-lg">
                      Открыть коллекцию <BIcon name="ChevronRight" class="w-3.5 h-3.5" />
                    </a>
                    <span v-if="b.price_label" class="text-white/75 text-sm font-semibold">{{ b.price_label }}</span>
                  </div>
                </div>
              </div>
            </div>
          </transition-group>
          <template v-if="heroBanners.length > 1">
            <button @click.stop="heroPrev" class="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-all border border-white/10">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <button @click.stop="heroNext" class="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-all border border-white/10">
              <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
            <div class="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              <button v-for="(_, i) in heroBanners" :key="i" @click.stop="heroGoto(i)" class="rounded-full transition-all" :class="heroCurrent === i ? 'w-5 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/60'"></button>
            </div>
          </template>
        </div>

        <!-- Красивый статичный герой (когда нет admin-баннеров) -->
        <div v-else class="relative overflow-hidden rounded-3xl shadow-2xl" style="min-height:190px">
          <!-- Gradient mesh bg -->
          <div class="absolute inset-0" style="background: linear-gradient(135deg, #1a0a38 0%, #0f0f20 45%, #1c0a30 100%)" />
          <!-- Blobs -->
          <div class="absolute -top-8 -left-8 w-64 h-64 rounded-full opacity-35 blur-3xl" style="background: radial-gradient(circle, #7B2D8B, transparent)" />
          <div class="absolute -bottom-8 right-16 w-56 h-56 rounded-full opacity-30 blur-3xl" style="background: radial-gradient(circle, #5B2EFF, transparent)" />
          <div class="absolute top-4 right-4 w-36 h-36 rounded-full opacity-20 blur-2xl" style="background: radial-gradient(circle, #2AABEE, transparent)" />

          <!-- Floating decorative chips -->
          <div class="absolute top-3 right-12 rotate-12 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-1.5 hidden md:flex items-center gap-1.5">
            <BIcon name="PawPrint" class="w-3.5 h-3.5 text-white/80" /><span class="text-white text-xs font-bold ml-0.5">Furry</span>
          </div>
          <div class="absolute bottom-4 right-6 -rotate-6 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-3 py-1.5 hidden md:flex items-center gap-1.5">
            <BIcon name="Sparkles" class="w-3.5 h-3.5 text-white/80" /><span class="text-white text-xs font-bold ml-0.5">Анимация</span>
          </div>
          <div class="absolute top-10 right-44 rotate-2 bg-[#2AABEE]/20 backdrop-blur-sm border border-[#2AABEE]/30 rounded-xl px-3 py-1.5 hidden xl:flex items-center gap-1.5">
            <BIcon name="Send" class="w-3.5 h-3.5 text-[#2AABEE]" /><span class="text-white text-xs font-bold ml-0.5">Telegram</span>
          </div>

          <div class="relative z-10 px-6 py-7 md:px-8">
            <div class="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style="background: linear-gradient(135deg, #7B2D8B, #5B2EFF)">
                    <span class="text-2xl">😸</span>
                  </div>
                  <div>
                    <h1 class="text-3xl font-black tracking-tight" style="background: linear-gradient(90deg, #fff 30%, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text">
                      Стикеры
                    </h1>
                    <p class="text-white/50 text-xs mt-0.5 font-medium">
                      {{ store.isLoading ? '…' : `${store.total} паков` }} &nbsp;·&nbsp; маркетплейс стикеров Bloomly
                    </p>
                  </div>
                </div>
                <p class="text-white/70 text-sm max-w-md leading-relaxed">
                  Уникальные стикеры для <span class="text-[#2AABEE] font-semibold">Telegram</span> и
                  <span class="text-[#5865F2] font-semibold">Discord</span> — от авторов
                  <span class="text-brand-accent font-semibold">Bloomly</span>.
                </p>
              </div>

              <!-- Search -->
              <div class="min-w-[220px]">
                <div class="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl px-4 py-2.5">
                  <BIcon name="Search" class="w-4 h-4 text-white/50 shrink-0" />
                  <input
                    v-model="searchQuery"
                    placeholder="Найти стикеры…"
                    @keyup.enter="loadData()"
                    class="bg-transparent text-sm text-white placeholder-white/35 outline-none w-full" />
                </div>
              </div>
            </div>

            <!-- Stats row -->
            <div class="flex gap-4 mt-5 flex-wrap">
              <div
                v-for="stat in [
                  { icon: 'Package', label: 'Паков', value: store.total },
                  { icon: 'Users', label: 'Авторов', value: new Set(store.packs.map((p: any) => p.author_id)).size },
                  { icon: 'Heart', label: 'В коллекциях', value: store.myCollection.length },
                ]"
                :key="stat.label"
                class="flex items-center gap-2 bg-white/8 backdrop-blur-sm border border-white/10 rounded-2xl px-4 py-2">
                <BIcon :name="stat.icon" class="w-3.5 h-3.5 text-[#c084fc]" />
                <span class="text-white font-extrabold text-sm">{{ stat.value }}</span>
                <span class="text-white/45 text-xs">{{ stat.label }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════
             PROMO TILES (только на главной вкладке)
        ════════════════════════════════════════════ -->
        <div v-if="activeTab === 'browse'" class="space-y-2">
          <div class="grid grid-cols-3 gap-3">
            <div
              v-for="tile in [
                { icon: 'Flame',    label: 'Популярные', sub: 'Выбор сообщества', from: '#7B2D8B', to: '#5B2EFF', filter: 'popular' },
                { icon: 'Sparkles', label: 'Новинки',    sub: 'Свежие паки',      from: '#059669', to: '#0891B2', filter: 'new'     },
                { icon: 'Gift',     label: 'Бесплатные', sub: 'Без оплаты',       from: '#D97706', to: '#DC2626', filter: 'free'    },
              ]"
              :key="tile.filter"
              @click="setFilter(tile.filter as FilterKey)"
              class="relative overflow-hidden rounded-2xl cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]"
              :class="activeFilter === tile.filter ? 'ring-2 ring-white/30' : ''"
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
        </div>

        <!-- ═══════════════════════════════════════════
             FEATURED PACKS (горизонтальный скролл)
        ════════════════════════════════════════════ -->
        <div v-if="activeTab === 'browse' && activeFilter === 'all' && store.packs.length > 0 && !store.isLoading" class="space-y-3">
          <h2 class="text-sm font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
            <BIcon name="Flame" class="w-4 h-4 text-orange-400" />
            Популярное
          </h2>
          <div class="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
            <div
              v-for="pack in store.packs.filter((p: any) => p.status === 'published').slice(0, 8)"
              :key="pack.id"
              class="flex-shrink-0 w-40 bg-brand-card border border-brand-border rounded-2xl overflow-hidden cursor-pointer group hover:border-purple-500/35 transition-all duration-200 hover:-translate-y-0.5 shadow-sm"
              @click="router.push({ name: 'sticker-pack', params: { id: pack.id } })">
              <!-- Cover -->
              <div class="relative w-full aspect-square overflow-hidden"
                :style="`background: ${pack.cover_bg_color ?? '#12101e'}`">
                <img v-if="pack.cover_url" :src="pack.cover_url" :alt="pack.name"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400" />
                <div v-else-if="pack.stickers.length" class="w-full h-full grid grid-cols-3 gap-px p-1" style="background: rgba(255,255,255,0.02)">
                  <div v-for="(s, i) in pack.stickers.slice(0, 9)" :key="i" class="rounded-sm overflow-hidden">
                    <StickerImg :src="s" />
                  </div>
                </div>
                <div v-else class="w-full h-full flex items-center justify-center">
                  <BIcon name="Sticker" class="w-8 h-8 text-purple-500/15" />
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <span class="absolute bottom-1.5 right-1.5 text-[9px] font-extrabold"
                  :class="parseFloat(pack.price) === 0 ? 'text-emerald-400' : 'text-brand-yellow'">
                  {{ parseFloat(pack.price) === 0 ? 'FREE' : parseFloat(pack.price).toLocaleString('ru-RU') + (pack.currency === 'RUB' ? '₽' : '') }}
                </span>
                <span class="absolute bottom-1.5 left-1.5 text-[9px] text-white/50 font-medium">{{ pack.stickers.length }} шт.</span>
              </div>
              <!-- Name + author -->
              <div class="px-2.5 py-2">
                <p class="text-xs font-bold text-white line-clamp-1 leading-tight">{{ pack.name }}</p>
                <div class="flex items-center gap-1 mt-0.5">
                  <img v-if="pack.author.avatar_url" :src="pack.author.avatar_url"
                    class="w-3 h-3 rounded-full object-cover opacity-60 flex-shrink-0" />
                  <span class="text-[9px] text-white/30 truncate">{{ pack.author.display_name ?? pack.author.username }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════
             TABS / FILTER BAR
        ════════════════════════════════════════════ -->
        <div class="flex flex-col gap-2">
          <!-- Main tab row -->
          <div class="flex items-center gap-2 flex-wrap">
            <button
              v-for="f in FILTERS" :key="f.key"
              @click="setFilter(f.key)"
              class="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap"
              :class="activeFilter === f.key && activeTab === 'browse'
                ? 'text-white shadow-md shadow-purple-500/25'
                : 'bg-brand-card border border-brand-border text-white/65 hover:text-white hover:border-white/20'"
              :style="activeFilter === f.key && activeTab === 'browse' ? 'background: linear-gradient(135deg, #7B2D8B, #5B2EFF)' : ''"
            >{{ f.label }}</button>

            <!-- Collection tab -->
            <button v-if="auth.user"
              @click="activeTab = 'collection'"
              class="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5"
              :class="activeTab === 'collection' ? 'text-white shadow-md shadow-purple-500/25' : 'bg-brand-card border border-brand-border text-white/65 hover:text-white hover:border-white/20'"
              :style="activeTab === 'collection' ? 'background: linear-gradient(135deg, #7B2D8B, #5B2EFF)' : ''">
              <BIcon name="Heart" class="w-3.5 h-3.5" />
              Коллекция
              <span v-if="store.myCollection.length" class="bg-white/20 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{{ store.myCollection.length }}</span>
            </button>

            <!-- Мои стикеры -->
            <button v-if="auth.user"
              @click="activeTab = 'my'"
              class="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap flex items-center gap-1.5"
              :class="activeTab === 'my' ? 'text-white shadow-md shadow-purple-500/25' : 'bg-brand-card border border-brand-border text-white/65 hover:text-white hover:border-white/20'"
              :style="activeTab === 'my' ? 'background: linear-gradient(135deg, #7B2D8B, #5B2EFF)' : ''">
              <BIcon name="User" class="w-3.5 h-3.5" />
              Мои паки
            </button>

            <!-- Import / Create — только на мобильном (на десктопе есть сайдбар) -->
            <div v-if="auth.user" class="flex gap-1.5 ml-auto flex-shrink-0 xl:hidden">
              <button @click="showTelegramModal = true"
                class="flex items-center gap-1.5 px-3 py-2 bg-[#2AABEE]/10 hover:bg-[#2AABEE]/20 border border-[#2AABEE]/30 text-[#2AABEE] text-xs font-bold rounded-full transition-all"
                title="Импорт из Telegram">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                <span class="hidden sm:inline">Импорт</span>
              </button>
              <button @click="openCreateModal"
                class="flex items-center gap-1.5 px-4 py-2 text-white text-xs font-bold rounded-full transition-all shadow-md"
                style="background: linear-gradient(135deg, #7B2D8B, #5B2EFF)">
                <BIcon name="Plus" class="w-3.5 h-3.5" /> Создать пак
              </button>
            </div>
          </div>

        </div>

        <!-- Section header -->
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-white/60 uppercase tracking-widest flex items-center gap-2">
            <BIcon name="LayoutGrid" class="w-4 h-4 text-[#c084fc]" />
            {{ sectionTitle }}
          </h2>
          <span v-if="sectionSubtitle" class="text-xs text-white/35 font-medium">{{ sectionSubtitle }}</span>
        </div>

        <!-- Loading skeleton -->
        <div v-if="store.isLoading" class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          <div v-for="n in 8" :key="n" class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden animate-pulse">
            <div class="w-full bg-brand-border" style="aspect-ratio:1/1" />
            <div class="px-3 py-2.5 space-y-2">
              <div class="h-3 bg-brand-border rounded-full w-3/4" />
              <div class="h-2.5 bg-brand-border rounded-full w-1/2" />
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="displayPacks.length === 0"
          class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
          <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
            <BIcon name="Sticker" class="w-10 h-10 text-white/40" />
          </div>
          <h3 class="text-lg font-bold text-white mb-2">
            {{ activeTab === 'collection' ? 'Коллекция пустая' : activeTab === 'my' ? 'Нет паков' : 'Ничего не найдено' }}
          </h3>
          <p class="text-white/55 text-sm mb-6">
            {{ activeTab === 'collection' ? 'Добавляй паки в коллекцию.' : activeTab === 'my' ? 'Создай свой первый пак!' : 'Попробуй другой запрос.' }}
          </p>
          <button v-if="(activeTab === 'my' || activeTab === 'collection') && auth.user"
            @click="activeTab === 'my' ? openCreateModal() : activeTab = 'browse'"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-bold rounded-2xl transition-all">
            <BIcon :name="activeTab === 'my' ? 'Plus' : 'ShoppingBag'" class="w-4 h-4" />
            {{ activeTab === 'my' ? 'Создать пак' : 'Смотреть паки' }}
          </button>
        </div>

        <!-- ── Packs grid (minimalist) ──────────────────────────────────── -->
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          <div
            v-for="pack in displayPacks" :key="pack.id"
            class="group relative bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:border-purple-500/40 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer shadow-sm"
            @click="openPack(pack)">

            <!-- Cover square -->
            <div class="relative w-full aspect-square overflow-hidden"
              :style="`background: ${pack.cover_bg_color ?? '#12101e'}`">

              <template v-if="pack.cover_url">
                <img :src="pack.cover_url" :alt="pack.name"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400" />
              </template>
              <template v-else-if="pack.stickers.length">
                <div class="w-full h-full grid grid-cols-3 gap-px p-1.5" style="background: rgba(255,255,255,0.02)">
                  <div v-for="(s, i) in pack.stickers.slice(0, 9)" :key="i"
                    class="rounded-md overflow-hidden">
                    <StickerImg :src="s" />
                  </div>
                </div>
              </template>
              <div v-else class="w-full h-full flex items-center justify-center">
                <BIcon name="Sticker" class="w-10 h-10 text-purple-500/15" />
              </div>

              <div class="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />

              <!-- NSFW блюр (если режим не включён) -->
              <div
                v-if="pack.is_nsfw && !nsfwEnabled"
                class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 cursor-pointer"
                style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); background: rgba(0,0,0,0.45)"
                @click.stop="showNsfwConfirm = true">
                <span class="text-3xl select-none">🔞</span>
                <span class="text-[10px] font-extrabold text-white bg-rose-600/90 px-3 py-1 rounded-full tracking-wide">18+ Нажми для просмотра</span>
              </div>

              <!-- Badges top-right -->
              <div class="absolute top-2 right-2 flex flex-col items-end gap-1">
                <span v-if="pack.status === 'draft'" class="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-amber-400/90 text-black">Черновик</span>
                <span v-if="pack.is_nsfw" class="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-rose-600/90 text-white">18+</span>
                <span v-if="pack.tags?.includes('animated')" class="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-blue-500/90 text-white">✦</span>
                <span v-if="pack.hide_author" class="text-[9px] font-bold px-2 py-0.5 rounded-lg bg-brand-border text-white/50">Аноним</span>
              </div>

              <!-- Count bottom-left -->
              <span class="absolute bottom-2 left-2 text-[10px] font-bold text-white/70 tabular-nums">
                {{ pack.stickers.length }} шт.
              </span>

              <!-- Price + stats bottom-right -->
              <div class="absolute bottom-2 right-2 flex flex-col items-end gap-0.5">
                <span class="text-[11px] font-extrabold"
                  :class="parseFloat(pack.price) === 0 ? 'text-emerald-400' : 'text-brand-yellow'">
                  {{ parseFloat(pack.price) === 0 ? 'FREE' : parseFloat(pack.price).toLocaleString('ru-RU') + (pack.currency === 'RUB' ? '₽' : ' ' + pack.currency) }}
                </span>
                <span v-if="pack.use_count > 0" class="text-[9px] text-white/35 tabular-nums">
                  {{ pack.use_count.toLocaleString('ru-RU') }} исп.
                </span>
              </div>

              <!-- Owner controls -->
              <div v-if="activeTab === 'my'"
                class="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" @click.stop>
                <button @click="openEdit(pack)"
                  class="w-6 h-6 bg-black/70 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-brand-accent transition-all">
                  <BIcon name="Pencil" class="w-3 h-3 text-white" />
                </button>
                <button @click="deletePack(pack.id)"
                  class="w-6 h-6 bg-black/70 backdrop-blur-sm rounded-lg flex items-center justify-center hover:bg-rose-500 transition-all">
                  <BIcon name="Trash2" class="w-3 h-3 text-white" />
                </button>
              </div>
            </div>

            <!-- Info -->
            <div class="px-3 py-2.5 flex items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="text-xs font-bold text-white line-clamp-1 leading-tight">{{ pack.name }}</p>
                <div class="flex items-center gap-1 mt-1">
                  <img v-if="pack.author.avatar_url" :src="pack.author.avatar_url"
                    class="w-3.5 h-3.5 rounded-full object-cover flex-shrink-0 opacity-70" />
                  <div v-else class="w-3.5 h-3.5 rounded-full bg-purple-500/25 flex items-center justify-center flex-shrink-0">
                    <span class="text-[6px] text-purple-400 font-bold">{{ (pack.author.display_name ?? pack.author.username)[0].toUpperCase() }}</span>
                  </div>
                  <span class="text-[10px] text-white/35 truncate">{{ pack.author.display_name ?? pack.author.username }}</span>
                  <img v-if="pack.author.is_verified" src="/icons/badges/paw_offical.svg" class="w-3 h-3 flex-shrink-0" title="Верифицирован" />
                </div>
              </div>

              <!-- Collection toggle -->
              <div @click.stop class="flex-shrink-0">
                <button v-if="auth.user && !isOwn(pack) && !inCollection(pack)"
                  @click.stop="toggleCollection(pack)"
                  class="w-7 h-7 rounded-xl bg-purple-500/15 hover:bg-purple-500 border border-purple-500/20 flex items-center justify-center transition-all">
                  <BIcon name="Plus" class="w-3.5 h-3.5 text-purple-400 group-hover:text-white" />
                </button>
                <div v-else-if="auth.user && !isOwn(pack) && inCollection(pack)"
                  class="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/25 flex items-center justify-center">
                  <BIcon name="Check" class="w-3.5 h-3.5 text-emerald-400" />
                </div>
              </div>
            </div>
          </div>
        </div>

      </main>

      <!-- ─── Right sidebar ─────────────────────────────────────────── -->
      <aside class="w-52 hidden xl:flex flex-col gap-4 sticky top-24 self-start flex-shrink-0">

        <!-- Create / Import -->  
        <div v-if="auth.user" class="flex flex-col gap-2">
          <button @click="openCreateModal"
            class="w-full flex items-center justify-center gap-2 py-3 text-white text-sm font-bold rounded-2xl transition-all shadow-lg"
            style="background: linear-gradient(135deg, #7B2D8B, #5B2EFF)">
            <BIcon name="Plus" class="w-4 h-4" />
            Создать пак
          </button>
          <button @click="showTelegramModal = true"
            class="w-full flex items-center justify-center gap-2 py-2.5 bg-[#2AABEE]/10 hover:bg-[#2AABEE]/20 border border-[#2AABEE]/30 text-[#2AABEE] text-sm font-bold rounded-2xl transition-all">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            Импорт из TG
          </button>
        </div>

        <!-- Quick filter mini-cards -->
        <div class="space-y-2">
          <h4 class="text-xs font-bold text-white/40 uppercase tracking-wider px-1">Быстрый фильтр</h4>
          <div
            v-for="tile in [
              { icon: 'Flame',       label: 'Популярные', filter: 'popular',  from: '#7B2D8B', to: '#5B2EFF' },
              { icon: 'Sparkles',    label: 'Новинки',    filter: 'new',      from: '#059669', to: '#0891B2' },
              { icon: 'Gift',        label: 'Бесплатные', filter: 'free',     from: '#D97706', to: '#DC2626' },
              { icon: 'Clapperboard',label: 'Анимация',   filter: 'animated', from: '#1D4ED8', to: '#7C3AED' },
            ]"
            :key="tile.filter"
            @click="setFilter(tile.filter as FilterKey)"
            class="relative overflow-hidden rounded-2xl cursor-pointer hover:scale-[1.02] transition-transform"
            :class="activeFilter === tile.filter ? 'ring-2 ring-white/20' : ''"
            style="height: 56px">
            <div class="absolute inset-0" :style="`background: linear-gradient(135deg, ${tile.from}bb, ${tile.to}bb)`" />
            <div class="relative z-10 h-full flex items-center gap-2.5 px-3">
              <BIcon :name="tile.icon" class="w-4 h-4 text-white/90 flex-shrink-0" />
              <span class="text-white font-bold text-xs">{{ tile.label }}</span>
            </div>
          </div>
        </div>

        <!-- Stats -->
        <div class="bg-brand-card border border-brand-border rounded-3xl p-4 shadow-xl space-y-2">
          <h4 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-3">Статистика</h4>
          <div class="flex items-center justify-between">
            <span class="text-xs text-white/55">Паков</span>
            <span class="text-sm font-bold text-white">{{ store.total }}</span>
          </div>
          <div v-if="auth.user" class="flex items-center justify-between">
            <span class="text-xs text-white/55">В коллекции</span>
            <span class="text-sm font-bold text-white">{{ store.myCollection.length }}</span>
          </div>
          <div v-if="auth.user" class="flex items-center justify-between">
            <span class="text-xs text-white/55">Моих паков</span>
            <span class="text-sm font-bold text-white">{{ store.myPacks.length }}</span>
          </div>
        </div>

      </aside>
    </div>

    <!-- ═══════════════════════════════════════════════
         Pack Wizard Modal (Create + Edit)
    ════════════════════════════════════════════════ -->
    <Teleport to="body">
      <transition name="modal-fade">
        <div v-if="showCreateModal"
          class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm"
          @click.self="tryCloseWizard()">

          <div class="modal-form bg-[#0e0e1c] border border-white/8 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

            <!-- Gradient header strip -->
            <div class="relative overflow-hidden flex-shrink-0">
              <div class="absolute inset-0" style="background: linear-gradient(135deg, #2d1060 0%, #1a0e3a 60%, #0e0c1e 100%)" />
              <!-- Decorative blobs -->
              <div class="absolute -top-8 -right-8 w-36 h-36 rounded-full opacity-30 blur-2xl pointer-events-none" style="background: radial-gradient(circle, #7B2D8B, transparent)" />
              <div class="absolute -bottom-4 left-6 w-20 h-20 rounded-full opacity-25 blur-xl pointer-events-none" style="background: radial-gradient(circle, #5B2EFF, transparent)" />

              <div class="relative z-10 px-6 pt-5 pb-5">
                <!-- Title row -->
                <div class="flex items-center justify-between mb-5">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg" style="background: linear-gradient(135deg, #7B2D8B, #5B2EFF)">
                      <BIcon name="Smile" class="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h2 class="text-lg font-black text-white">
                        {{ editingPackId ? 'Редактировать пак' : 'Новый стикерпак' }}
                      </h2>
                      <p class="text-xs text-white/40 mt-0.5">Стикеры · Bloomly</p>
                    </div>
                  </div>
                  <button @click="tryCloseWizard()"
                    class="w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-all">
                    <BIcon name="X" class="w-4 h-4 text-white/70" />
                  </button>
                </div>

                <!-- Step indicators: numbered circles with connector line -->
                <div class="flex items-center gap-0">
                  <template v-for="(step, idx) in [{k:'stickers',l:'Стикеры'},{k:'info',l:'Инфо'},{k:'cover',l:'Обложка'}]" :key="step.k">
                    <!-- Step node -->
                    <button @click="wizardStep = step.k as WizardStep"
                      class="flex flex-col items-center gap-1.5 flex-shrink-0 relative transition-all group">
                      <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all shadow-md"
                        :class="wizardStep === step.k
                          ? 'text-white scale-110 shadow-purple-500/40'
                          : 'bg-white/8 text-white/40 group-hover:bg-white/15 group-hover:text-white/70'"
                        :style="wizardStep === step.k ? 'background: linear-gradient(135deg, #7B2D8B, #5B2EFF);' :
                          ['stickers','info','cover'].indexOf(wizardStep) > idx ? 'background: linear-gradient(135deg, #7B2D8B88, #5B2EFF88)' : ''">
                        <!-- Checkmark for completed -->
                        <span v-if="['stickers','info','cover'].indexOf(wizardStep) > idx" class="text-white/80">✓</span>
                        <span v-else>{{ idx + 1 }}</span>
                      </div>
                      <span class="text-[10px] font-bold transition-colors"
                        :class="wizardStep === step.k ? 'text-white' : 'text-white/35'">
                        {{ step.l }}
                      </span>
                    </button>
                    <!-- Connector line (between steps) -->
                    <div v-if="idx < 2" class="flex-1 h-px mx-2 mb-4 transition-all"
                      :style="['stickers','info','cover'].indexOf(wizardStep) > idx
                        ? 'background: linear-gradient(90deg, #7B2D8B80, #5B2EFF80)'
                        : 'background: rgba(255,255,255,0.1)'" />
                  </template>
                </div>
              </div>
            </div>

            <!-- ── Step 1: Stickers ─────────────────────────────────────── -->
            <div v-if="wizardStep === 'stickers'" class="flex-1 overflow-y-auto p-6 space-y-4">

              <!-- Upload zone -->
              <div class="relative group">
                <StickerUpload
                  @uploaded="(url) => { form.stickers.push(url); if (form.stickers.length === 1) form.coverStickerIdx = 0 }"
                  @removed="(url) => { const i = form.stickers.indexOf(url); if (i >= 0) removeSticker(i) }" />
              </div>

              <!-- Sticker grid -->
              <div v-if="form.stickers.length" class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-bold text-white/55">{{ form.stickers.length }} стикеров · нажми на стикер для настройки</span>
                  <span v-if="form.nsfwStickers.length" class="text-xs font-bold text-rose-400 bg-rose-400/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                    {{ form.nsfwStickers.length }} NSFW
                  </span>
                </div>
                <div class="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  <div v-for="(s, i) in form.stickers" :key="i"
                    class="relative aspect-square rounded-2xl overflow-hidden bg-white/5 border-2 transition-all cursor-pointer group/sticker"
                    :class="[
                      form.nsfwStickers.includes(i) ? 'border-rose-500/60' : 'border-transparent hover:border-white/20',
                      form.coverStickerIdx === i ? 'ring-2 ring-brand-purple ring-offset-2 ring-offset-[#131320]' : ''
                    ]">

                    <!-- Sticker image -->
                    <img :src="s" class="w-full h-full object-contain p-1.5" />

                    <!-- NSFW overlay -->
                    <div v-if="form.nsfwStickers.includes(i)"
                      class="absolute inset-0 bg-rose-500/20 backdrop-blur-[2px] flex items-center justify-center">
                      <span class="text-[9px] font-extrabold text-rose-300 bg-rose-500/80 px-1.5 py-0.5 rounded-full tracking-wider">NSFW</span>
                    </div>

                    <!-- Cover star -->
                    <div v-if="form.coverStickerIdx === i"
                      class="absolute top-1 left-1 w-4 h-4 bg-brand-purple rounded-full flex items-center justify-center">
                      <BIcon name="Star" class="w-2.5 h-2.5 text-white" />
                    </div>

                    <!-- Hover actions -->
                    <div class="absolute inset-0 bg-black/70 opacity-0 group-hover/sticker:opacity-100 transition-all flex flex-col items-center justify-center gap-1.5">
                      <!-- NSFW toggle -->
                      <button @click.stop="toggleStickerNsfw(i)"
                        class="w-7 h-7 rounded-full flex items-center justify-center transition-all text-white text-[9px] font-extrabold"
                        :class="form.nsfwStickers.includes(i) ? 'bg-rose-500' : 'bg-white/20 hover:bg-rose-500'"
                        title="18+">18+</button>
                      <!-- Use as cover -->
                      <button @click.stop="form.coverStickerIdx = form.coverStickerIdx === i ? null : i"
                        class="w-7 h-7 rounded-full flex items-center justify-center transition-all"
                        :class="form.coverStickerIdx === i ? 'bg-brand-purple' : 'bg-white/20 hover:bg-brand-purple'"
                        title="На обложку">
                        <BIcon name="Star" class="w-3 h-3 text-white" />
                      </button>
                      <!-- Remove -->
                      <button @click.stop="removeSticker(i)"
                        class="w-7 h-7 rounded-full bg-white/20 hover:bg-rose-500 flex items-center justify-center transition-all"
                        title="Удалить">
                        <BIcon name="Trash2" class="w-3 h-3 text-white" />
                      </button>
                    </div>
                  </div>
                </div>

                <p class="text-[11px] text-white/30">
                  <span class="text-brand-purple">★</span> — стикер для обложки &nbsp;·&nbsp;
                  <span class="text-rose-400">18+</span> — будет размыт без NSFW-режима
                </p>
              </div>

              <!-- Empty hint -->
              <div v-else class="py-8 text-center text-white/30">
                <BIcon name="ImageUp" class="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p class="text-sm">Загрузи стикеры выше</p>
                <p class="text-xs mt-1">Поддержка .webp, .png, .webm (Telegram)</p>
              </div>

              <div class="flex justify-end pt-2">
                <button @click="wizardStep = 'info'"
                  class="flex items-center gap-2 px-5 py-2.5 bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-brand-purple/20">
                  Далее: информация <BIcon name="ChevronRight" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- ── Step 2: Info ─────────────────────────────────────────── -->
            <div v-else-if="wizardStep === 'info'" class="flex-1 overflow-y-auto p-6 space-y-4">

              <!-- Name -->
              <div>
                <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Название *</label>
                <input v-model="form.name" maxlength="120" placeholder="Напр. «Весенние котики»"
                  class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/25 outline-none focus:border-brand-purple/60 focus:bg-brand-purple/5 transition-all text-sm font-semibold" />
              </div>

              <!-- Description -->
              <div>
                <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Описание</label>
                <textarea v-model="form.description" rows="3" placeholder="Расскажи о стикерах…"
                  class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/25 outline-none focus:border-brand-purple/60 focus:bg-brand-purple/5 transition-all text-sm resize-none" />
              </div>

              <!-- Price + Currency -->
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Цена</label>
                  <div class="relative">
                    <input v-model.number="form.price" type="number" min="0" step="1"
                      class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 pr-16 text-white outline-none focus:border-brand-purple/60 transition-all text-sm" />
                    <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/35 font-bold">
                      {{ form.price === 0 ? 'FREE' : form.currency }}
                    </span>
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Валюта</label>
                  <select v-model="form.currency"
                    class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white outline-none focus:border-brand-purple/60 transition-all text-sm appearance-none">
                    <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
                  </select>
                </div>
              </div>

              <!-- Tags -->
              <div>
                <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Теги</label>
                <input v-model="form.tags" placeholder="фурри, арт, анимация"
                  class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white placeholder-white/25 outline-none focus:border-brand-purple/60 transition-all text-sm" />
                <p class="text-[11px] text-white/30 mt-1">Через запятую · влияет на фильтрацию и поиск</p>
              </div>

              <!-- Status -->
              <div>
                <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-1.5">Статус публикации</label>
                <div class="flex gap-3">
                  <button v-for="s in [{ v: 'published', l: '🌍 Опубликован' }, { v: 'draft', l: '✏️ Черновик' }]"
                    :key="s.v" @click="form.status = s.v as any"
                    class="flex-1 py-2.5 rounded-2xl text-sm font-bold transition-all border"
                    :class="form.status === s.v
                      ? 'bg-brand-purple/20 border-brand-purple/50 text-brand-purple'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white hover:border-white/20'">
                    {{ s.l }}
                  </button>
                </div>
              </div>

              <!-- NSFW toggle (whole pack) -->
              <div class="flex items-center justify-between p-4 rounded-2xl bg-rose-500/8 border border-rose-500/20">
                <div>
                  <p class="text-sm font-bold text-white">18+ контент</p>
                  <p class="text-xs text-white/45 mt-0.5">Весь пак будет размыт для пользователей без NSFW-режима</p>
                </div>
                <button @click="form.isNsfw = !form.isNsfw"
                  class="w-12 h-6 rounded-full transition-all relative flex-shrink-0"
                  :class="form.isNsfw ? 'bg-rose-500' : 'bg-white/15'">
                  <div class="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-md"
                    :class="form.isNsfw ? 'left-6' : 'left-0.5'" />
                </button>
              </div>

              <!-- Hide author toggle -->
              <div class="flex items-center justify-between p-4 rounded-2xl bg-brand-bg border border-brand-border">
                <div>
                  <p class="text-sm font-bold text-white">Скрыть автора</p>
                  <p class="text-xs text-white/45 mt-0.5">Имя автора не будет виден публично (только администраторам)</p>
                </div>
                <button @click="form.hideAuthor = !form.hideAuthor"
                  class="w-12 h-6 rounded-full transition-all relative flex-shrink-0"
                  :class="form.hideAuthor ? 'bg-brand-accent' : 'bg-white/15'">
                  <div class="w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-md"
                    :class="form.hideAuthor ? 'left-6' : 'left-0.5'" />
                </button>
              </div>

              <div class="flex gap-3 pt-2">
                <button @click="wizardStep = 'stickers'"
                  class="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 text-sm font-bold rounded-2xl transition-all">
                  <BIcon name="ChevronLeft" class="w-4 h-4 inline mr-1" />Назад
                </button>
                <button @click="wizardStep = 'cover'"
                  class="flex-1 flex items-center justify-center gap-2 py-2.5 bg-brand-purple hover:bg-brand-purple/90 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-brand-purple/20">
                  Далее: обложка <BIcon name="ChevronRight" class="w-4 h-4" />
                </button>
              </div>
            </div>

            <!-- ── Step 3: Cover ────────────────────────────────────────── -->
            <div v-else-if="wizardStep === 'cover'" class="flex-1 overflow-y-auto p-6 space-y-5">

              <!-- Live preview -->
              <div>
                <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-2">Предпросмотр обложки</label>
                <div class="relative w-full aspect-[3/2] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                  <!-- Custom image takes priority -->
                  <img v-if="form.coverUrl" :src="form.coverUrl" class="absolute inset-0 w-full h-full object-cover" />
                  <!-- Solid color background -->
                  <div v-else class="absolute inset-0 w-full h-full" :style="{ background: form.coverBgColor }"></div>
                  <!-- Subtle gradient vignette -->
                  <div class="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/30 pointer-events-none"></div>
                  <!-- Hero sticker -->
                  <img v-if="heroStickerUrl"
                    :src="heroStickerUrl"
                    class="absolute right-4 bottom-4 w-28 h-28 object-contain drop-shadow-2xl"
                    :class="form.nsfwStickers.includes(form.coverStickerIdx!) ? 'blur-md' : ''" />
                  <!-- Pack name -->
                  <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pt-8">
                    <p class="font-black text-white text-xl leading-tight drop-shadow-lg">{{ form.name || 'Название пака' }}</p>
                    <p v-if="form.price > 0" class="text-white/70 text-sm mt-0.5">{{ form.price }} {{ form.currency }}</p>
                    <p v-else class="text-emerald-400 text-sm font-bold mt-0.5">Бесплатно</p>
                  </div>
                </div>
              </div>

              <!-- Color palette -->
              <div v-if="!form.coverUrl">
                <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-2">Цвет фона</label>
                <div class="flex flex-wrap gap-2">
                  <button v-for="color in COVER_COLORS" :key="color"
                    @click="form.coverBgColor = color"
                    class="w-9 h-9 rounded-xl transition-all border-2"
                    :style="{ background: color }"
                    :class="form.coverBgColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent hover:border-white/40 hover:scale-105'" />
                  <!-- Custom color -->
                  <label class="w-9 h-9 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 cursor-pointer flex items-center justify-center transition-all overflow-hidden relative" title="Свой цвет">
                    <BIcon name="Pipette" class="w-4 h-4 text-white/50" />
                    <input type="color" v-model="form.coverBgColor"
                      class="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                  </label>
                </div>
                <!-- Custom hex input -->
                <div class="flex items-center gap-2 mt-2">
                  <div class="w-6 h-6 rounded-lg border border-white/20 flex-shrink-0" :style="{ background: form.coverBgColor }"></div>
                  <input v-model="form.coverBgColor" placeholder="#000000"
                    class="w-32 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white/70 outline-none focus:border-brand-purple/60 transition-all font-mono" />
                </div>
              </div>

              <!-- Custom image upload -->
              <div>
                <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-2">
                  {{ form.coverUrl ? '✓ Кастомное изображение' : 'Загрузить изображение (опционально)' }}
                </label>
                <div v-if="form.coverUrl" class="flex items-center gap-3 p-3 bg-white/5 border border-white/10 rounded-2xl">
                  <img :src="form.coverUrl" class="w-14 h-10 object-cover rounded-xl flex-shrink-0 border border-white/10" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-white/70 truncate">Изображение загружено</p>
                    <p class="text-[11px] text-white/35">Перекрывает цвет фона</p>
                  </div>
                  <button @click="form.coverUrl = ''"
                    class="w-7 h-7 rounded-full bg-white/10 hover:bg-rose-500/20 flex items-center justify-center transition-all flex-shrink-0">
                    <BIcon name="X" class="w-3.5 h-3.5 text-white/60" />
                  </button>
                </div>
                <MediaUpload v-else type="posts" @uploaded="(urls) => form.coverUrl = urls[0] ?? ''" />
              </div>

              <!-- Select hero sticker for cover -->
              <div v-if="form.stickers.length">
                <label class="block text-xs font-bold text-white/45 uppercase tracking-wider mb-2">
                  Стикер на обложке <span v-if="form.coverStickerIdx !== null" class="text-brand-purple normal-case">· выбран №{{ form.coverStickerIdx + 1 }}</span>
                </label>
                <div class="flex gap-2 flex-wrap">
                  <button @click="form.coverStickerIdx = null"
                    class="w-12 h-12 rounded-xl border-2 transition-all flex items-center justify-center text-xs text-white/40"
                    :class="form.coverStickerIdx === null ? 'border-white/50 bg-white/10' : 'border-white/10 hover:border-white/30'"
                    title="Без стикера">
                    <BIcon name="X" class="w-4 h-4" />
                  </button>
                  <button v-for="(s, i) in form.stickers" :key="i"
                    @click="form.coverStickerIdx = form.coverStickerIdx === i ? null : i"
                    class="w-12 h-12 rounded-xl border-2 overflow-hidden bg-white/5 transition-all"
                    :class="form.coverStickerIdx === i
                      ? 'border-brand-purple ring-2 ring-brand-purple/30'
                      : 'border-white/10 hover:border-white/30'">
                    <img :src="s" class="w-full h-full object-contain p-0.5" />
                  </button>
                </div>
              </div>

              <!-- Submit -->
              <div class="flex gap-3 pt-2">
                <button @click="wizardStep = 'info'"
                  class="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 text-sm font-bold rounded-2xl transition-all">
                  <BIcon name="ChevronLeft" class="w-4 h-4 inline mr-1" />Назад
                </button>
                <button @click="submitCreate" :disabled="isCreating || !form.name.trim()"
                  class="flex-1 flex items-center justify-center gap-2 py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-2xl transition-all shadow-lg"
                  :class="form.name.trim()
                    ? 'bg-gradient-to-r from-brand-purple to-brand-accent hover:opacity-90 shadow-brand-purple/30'
                    : 'bg-white/10 cursor-not-allowed'">
                  <BIcon v-if="!isCreating" :name="editingPackId ? 'Save' : 'Rocket'" class="w-4 h-4" />
                  <span v-if="isCreating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  {{ isCreating ? 'Сохранение…' : editingPackId ? 'Сохранить' : 'Опубликовать' }}
                </button>
              </div>
            </div>

          </div>
        </div>
      </transition>
    </Teleport>

    <!-- Telegram import modal -->
    <TelegramImportModal
      v-if="showTelegramModal"
      @close="showTelegramModal = false"
      @imported="handleTelegramImport" />

    <!-- NSFW confirm modal -->
    <Teleport to="body">
      <transition name="modal-fade">
        <div v-if="showNsfwConfirm"
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style="background: rgba(0,0,0,0.75); backdrop-filter: blur(8px)"
          @click.self="showNsfwConfirm = false">
          <div class="w-full max-w-sm rounded-3xl border border-brand-border shadow-2xl overflow-hidden"
            style="background: linear-gradient(145deg, #1a1b35, #13142a)">
            <!-- Icon -->
            <div class="flex flex-col items-center pt-8 pb-5 px-6 text-center">
              <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl mb-4"
                style="background: rgba(225,70,100,0.15); border: 1px solid rgba(225,70,100,0.3)">
                🔞
              </div>
              <h2 class="text-lg font-extrabold text-white mb-2">Контент 18+</h2>
              <p class="text-sm text-white/55 leading-relaxed">
                Этот контент предназначен только для взрослых.<br>
                Включи NSFW-режим, чтобы просматривать такие материалы.
              </p>
            </div>
            <!-- Warning -->
            <div class="mx-6 mb-5 px-4 py-3 rounded-2xl flex items-start gap-2.5"
              style="background: rgba(225,70,100,0.08); border: 1px solid rgba(225,70,100,0.2)">
              <BIcon name="AlertTriangle" class="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p class="text-xs text-rose-300/80 leading-relaxed">
                Подтверждая, ты заявляешь что тебе есть 18 лет и ты согласен с
                <span class="text-rose-400 font-semibold">правилами платформы</span>.
              </p>
            </div>
            <!-- Buttons -->
            <div class="flex gap-3 px-6 pb-6">
              <button
                @click="showNsfwConfirm = false"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white/50 bg-white/5 hover:bg-white/10 border border-brand-border transition-all">
                Отмена
              </button>
              <button
                @click="enableNsfw(); showNsfwConfirm = false"
                class="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white transition-all shadow-lg"
                style="background: linear-gradient(135deg, #c0392b, #e14664); box-shadow: 0 4px 20px rgba(225,70,100,0.3)">
                Мне 18+, включить
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

  </div>
</template>

<style scoped>
/* Dark field borders for wizard modal */
.modal-form input,
.modal-form textarea,
.modal-form select {
  background-color: #0f0f28 !important;
  border-color: #25254c !important;
}
.modal-form input:focus,
.modal-form textarea:focus,
.modal-form select:focus {
  border-color: rgba(123, 45, 139, 0.5) !important;
  background-color: rgba(91, 46, 255, 0.05) !important;
}

/* Color picker special case */
.modal-form input[type=color] {
  background-color: transparent !important;
  border-color: #25254c !important;
  padding: 2px !important;
}

/* Range input */
.modal-form input[type=range] {
  background-color: transparent !important;
  border: none !important;
}

/* Fade transition for wizard */
.modal-fade-enter-active, .modal-fade-leave-active { transition: opacity 0.2s ease; }
.modal-fade-enter-from, .modal-fade-leave-to { opacity: 0; }

/* Hero carousel slide */
.hero-slide-enter-active,
.hero-slide-leave-active {
  transition: opacity 0.5s ease;
  position: absolute;
  inset: 0;
}
.hero-slide-enter-from,
.hero-slide-leave-to {
  opacity: 0;
}

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
