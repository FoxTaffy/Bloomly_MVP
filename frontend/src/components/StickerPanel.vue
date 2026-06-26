<template>
  <div
    class="sticker-panel bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden flex flex-col select-none"
    style="width: 340px; max-height: 440px">

    <!-- ── Search bar (toggle) ──────────────────────────────────────────── -->
    <Transition name="search-slide">
      <div v-if="searchOpen" class="px-2 py-1.5 flex-shrink-0 border-b border-brand-border/40">
        <div class="flex items-center gap-1.5 bg-brand-bg rounded-xl px-2.5 py-1.5 border border-brand-border/60">
          <BIcon name="Search" class="w-3 h-3 text-white/40 flex-shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Поиск стикеров…"
            class="flex-1 text-xs bg-transparent text-white placeholder-white/30 outline-none"
            autofocus />
          <button v-if="searchQuery" @click="searchQuery = ''" class="text-white/35 hover:text-white transition-colors">
            <BIcon name="X" class="w-3 h-3" />
          </button>
        </div>
      </div>
    </Transition>

    <!-- ── Content area ──────────────────────────────────────────────────── -->
    <div class="flex-1 overflow-y-auto min-h-0 scrollbar-hide p-1.5">

      <!-- Loading skeleton -->
      <div v-if="stickersStore.isLoading" class="grid grid-cols-5 gap-1.5">
        <div v-for="i in 15" :key="i" class="aspect-square rounded-xl bg-brand-border/60 animate-pulse" />
      </div>

      <!-- ══ STICKER MODE ══ -->
      <template v-else>

        <!-- Search results -->
        <template v-if="searchQuery.trim()">
          <p v-if="!stickerSearchResults.length" class="text-xs text-white/35 text-center py-8">Ничего не найдено</p>
          <div v-else class="grid grid-cols-5 gap-1.5">
            <button
              v-for="item in stickerSearchResults" :key="item.url"
              @click="pick(item.url)"
              class="relative aspect-square rounded-xl bg-white/5 border border-brand-border/30 hover:border-brand-accent/50 hover:bg-brand-accent/8 transition-all active:scale-90 flex items-center justify-center p-1 overflow-hidden group"
              :title="item.packName">
              <StickerRenderer :src="item.url" size="sm" :loop="false" :autoplay="false" class="!w-full !h-full pointer-events-none" />
              <FavBtn :url="item.url" />
            </button>
          </div>
        </template>

        <!-- ⭐ Favourites -->
        <template v-else-if="activeNav === '__fav__'">
          <div v-if="!favStickers.length" class="flex flex-col items-center justify-center h-32 gap-2 text-white/35 text-xs px-4 text-center">
            <span class="text-3xl">⭐</span>
            <span>Нажмите ♥ на любом стикере,<br>чтобы добавить в избранные</span>
          </div>
          <div v-else class="grid grid-cols-5 gap-1.5">
            <button
              v-for="url in favStickers" :key="url"
              @click="pick(url)"
              class="relative aspect-square rounded-xl bg-white/5 border border-brand-border/30 hover:border-brand-accent/50 hover:bg-brand-accent/8 transition-all active:scale-90 flex items-center justify-center p-1 overflow-hidden group">
              <StickerRenderer :src="url" size="sm" :loop="false" :autoplay="false" class="!w-full !h-full pointer-events-none" />
              <FavBtn :url="url" />
            </button>
          </div>
        </template>

        <!-- 🔥 Frequently used -->
        <template v-else-if="activeNav === '__frequent__'">
          <div v-if="!frequentDisplay.length" class="flex flex-col items-center justify-center h-32 gap-2 text-white/35 text-xs px-4 text-center">
            <span class="text-3xl">🔥</span>
            <span>Здесь появятся часто<br>используемые стикеры</span>
          </div>
          <div v-else class="grid grid-cols-5 gap-1.5">
            <button
              v-for="url in frequentDisplay" :key="url"
              @click="pick(url)"
              class="relative aspect-square rounded-xl bg-white/5 border border-brand-border/30 hover:border-brand-accent/50 hover:bg-brand-accent/8 transition-all active:scale-90 flex items-center justify-center p-1 overflow-hidden group">
              <StickerRenderer :src="url" size="sm" :loop="false" :autoplay="false" class="!w-full !h-full pointer-events-none" />
              <FavBtn :url="url" />
            </button>
          </div>
        </template>

        <!-- Specific pack -->
        <template v-else-if="currentPack">
          <!-- Pack header with name + stats + paid badge -->
          <div class="flex items-center justify-between mb-1.5 px-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <p class="text-[10px] font-bold text-white/40 uppercase tracking-wider truncate">
                {{ currentPack.name }}
              </p>
              <span v-if="ownPackIds.has(currentPack.id)" class="text-[8px] text-white/30 flex-shrink-0">✏️</span>
              <span v-if="currentPack.is_nsfw" class="text-[8px] font-bold px-1 py-px rounded bg-rose-500/20 text-rose-400 flex-shrink-0 border border-rose-500/20">18+</span>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
              <!-- Popularity indicator -->
              <span v-if="currentPack.use_count > 0" class="text-[9px] text-white/30">
                🔥{{ currentPack.use_count > 999 ? Math.round(currentPack.use_count / 1000) + 'k' : currentPack.use_count }}
              </span>
              <!-- Paid badge -->
              <span v-if="parseFloat(currentPack.price) > 0 && !isInCollection(currentPack)" class="text-[9px] font-extrabold text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-1.5 py-px rounded-full">
                {{ formatPrice(currentPack.price, currentPack.currency) }}
              </span>
            </div>
          </div>
          <!-- Stickers grid -->
          <div v-if="!currentPack.stickers.length" class="flex flex-col items-center justify-center h-24 gap-2 text-white/35 text-xs">
            <BIcon name="Ghost" class="w-7 h-7 opacity-50" />
            В этом паке нет стикеров
          </div>
          <div v-else class="grid grid-cols-5 gap-1.5">
            <button
              v-for="(url, idx) in currentPack.stickers" :key="url"
              @click="pick(url, currentPack)"
              :class="[
                'relative aspect-square rounded-xl bg-white/5 border transition-all active:scale-90 flex items-center justify-center p-1 overflow-hidden group',
                currentPack.nsfw_stickers?.includes(idx)
                  ? 'border-pink-500/25 hover:border-pink-400/60'
                  : 'border-brand-border/30 hover:border-brand-accent/50 hover:bg-brand-accent/8',
              ]">
              <!-- NSFW badge -->
              <span v-if="currentPack.nsfw_stickers?.includes(idx)"
                class="absolute top-0.5 right-0.5 text-[7px] bg-pink-500/80 text-white px-0.5 rounded z-10 leading-none py-[1px] font-bold">18+</span>
              <!-- Paid lock overlay -->
              <div
                v-if="parseFloat(currentPack.price) > 0 && !isInCollection(currentPack) && !ownPackIds.has(currentPack.id)"
                class="absolute inset-0 bg-black/55 flex flex-col items-center justify-center z-20 rounded-xl gap-0.5"
                @click.stop="openPack(currentPack)">
                <BIcon name="Lock" class="w-3 h-3 text-yellow-400/80" />
              </div>
              <StickerRenderer :src="url" size="sm" :loop="false" :autoplay="false" class="!w-full !h-full pointer-events-none" />
              <FavBtn :url="url" />
            </button>
          </div>
        </template>

        <!-- Empty collection -->
        <div v-else class="flex flex-col items-center justify-center h-32 gap-2.5 px-4 text-center">
          <BIcon name="PackageOpen" class="w-9 h-9 text-white/20" />
          <p class="text-xs text-white/45 leading-snug">
            Коллекция пуста.<br>
            <router-link to="/stickers" class="text-brand-accent hover:underline">Найдите паки</router-link> в каталоге.
          </p>
        </div>
      </template>

    </div>

    <!-- ── Unified bottom nav bar (Telegram style) ──────────────────────── -->
    <div class="flex items-center flex-shrink-0 border-t border-brand-border/50 bg-brand-bg/20 py-1 overflow-x-auto scrollbar-hide px-1 gap-0.5">

      <!-- 🔍 Search toggle -->
      <button
        @click="searchOpen = !searchOpen; if (!searchOpen) searchQuery = ''"
        :class="['flex-shrink-0 w-9 h-9 mb-0.5 rounded-2xl flex items-center justify-center transition-all',
          searchOpen ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/35 hover:text-white hover:bg-white/8']">
        <BIcon name="Search" class="w-4 h-4" />
      </button>

      <!-- ⭐ Favorites -->
      <button
        @click="setNav('__fav__')"
        :class="['flex-shrink-0 w-9 h-9 mb-0.5 rounded-2xl flex items-center justify-center transition-all text-base',
          activeNav === '__fav__' ? 'bg-brand-accent/15 text-brand-accent' : 'hover:bg-white/8 text-white/70']"
        title="Избранные">⭐</button>

      <!-- 🔥 Frequently used -->
      <button
        @click="setNav('__frequent__')"
        :class="['flex-shrink-0 w-9 h-9 mb-0.5 rounded-2xl flex items-center justify-center transition-all text-base',
          activeNav === '__frequent__' ? 'bg-brand-accent/15 text-brand-accent' : 'hover:bg-white/8 text-white/70']"
        title="Часто используемые">🔥</button>

      <!-- Pack icons -->
      <button
        v-for="pack in collection" :key="pack.id"
        @click="setNav(pack.id)"
        :class="['flex-shrink-0 w-9 h-9 mb-0.5 rounded-2xl flex items-center justify-center overflow-hidden transition-all',
          activeNav === pack.id ? 'bg-brand-accent/15 ring-2 ring-brand-accent/50' : 'hover:bg-white/8 opacity-70 hover:opacity-100']"
        :title="pack.name">
        <StickerRenderer
          v-if="pack.stickers.length"
          :src="pack.cover_url || pack.stickers[pack.cover_sticker_idx ?? 0] || pack.stickers[0]"
          size="xs"
          :loop="false" :autoplay="false"
          class="!w-7 !h-7 pointer-events-none" />
        <span v-else class="text-sm">📦</span>
      </button>

      <!-- Upload new sticker -->
      <button
        @click="importTgsRef?.click()"
        class="flex-shrink-0 w-9 h-9 mb-0.5 rounded-2xl flex items-center justify-center text-white/30 hover:bg-brand-accent/15 hover:text-brand-accent transition-all"
        title="Загрузить стикер (.tgs/.webp)">
        <BIcon name="Upload" class="w-4 h-4" />
      </button>

      <!-- Catalog link -->
      <router-link
        to="/stickers"
        class="flex-shrink-0 w-9 h-9 mb-0.5 rounded-2xl flex items-center justify-center text-white/30 hover:bg-brand-accent/15 hover:text-brand-accent transition-all"
        title="Каталог стикеров">
        <BIcon name="ExternalLink" class="w-3.5 h-3.5" />
      </router-link>

      <input ref="importTgsRef" type="file" accept=".tgs,.json,.lottie,.webp,.png,.gif" class="sr-only" @change="importTgs" />
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, defineComponent, h } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import StickerRenderer from '@/components/StickerRenderer.vue'
import { useStickersStore, type StickerPack } from '@/stores/stickers'
import api from '@/api'

const emit = defineEmits<{
  (e: 'pick', url: string): void
}>()

const stickersStore = useStickersStore()
const router        = useRouter()

// ── Nav state ──────────────────────────────────────────────────────────────
// activeNav values: '__fav__' | '__frequent__' | '{packId}'
const activeNav   = ref<string>('__recent_pack__') // will be set on mount
const searchOpen  = ref(false)
const searchQuery = ref('')

function setNav(id: string) {
  activeNav.value  = id
  searchQuery.value = ''
  searchOpen.value  = false
}

// ── Collection ─────────────────────────────────────────────────────────────
const collection = computed(() => {
  const seen = new Set<string>()
  const all: StickerPack[] = []
  for (const p of stickersStore.myPacks) {
    if (!seen.has(p.id) && p.stickers.length > 0) { seen.add(p.id); all.push(p) }
  }
  for (const p of stickersStore.myCollection) {
    if (!seen.has(p.id) && p.stickers.length > 0) { seen.add(p.id); all.push(p) }
  }
  return all
})

const ownPackIds = computed(() => new Set(stickersStore.myPacks.map(p => p.id)))

const currentPack = computed(() =>
  collection.value.find(p => p.id === activeNav.value) ?? null,
)

function isInCollection(pack: StickerPack): boolean {
  return stickersStore.myCollection.some(p => p.id === pack.id)
}

function openPack(pack: StickerPack) {
  router.push({ name: 'sticker-pack', params: { id: pack.id } })
}

function formatPrice(price: string, currency: string): string {
  const n = parseFloat(price)
  if (currency === 'RUB') return n.toLocaleString('ru-RU') + ' ₽'
  if (currency === 'USD') return '$' + n.toFixed(2)
  return n.toFixed(2) + ' ' + currency
}

// ── Favourites & Frequent ──────────────────────────────────────────────────
const favStickers     = computed(() => stickersStore.favoriteStickers)
const frequentDisplay = computed(() =>
  stickersStore.frequentStickers.length
    ? stickersStore.frequentStickers
    : stickersStore.recentStickers,
)

// ── Sticker search ─────────────────────────────────────────────────────────
interface FlatSticker { url: string; packName: string }
const stickerSearchResults = computed<FlatSticker[]>(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return []
  const results: FlatSticker[] = []
  for (const pack of collection.value) {
    if (pack.name.toLowerCase().includes(q) || pack.tags?.some((t: string) => t.toLowerCase().includes(q))) {
      pack.stickers.forEach((url: string) => results.push({ url, packName: pack.name }))
    }
  }
  return results
})

// ── Favourite toggle inline component ─────────────────────────────────────
const FavBtn = defineComponent({
  props: { url: { type: String, required: true } },
  setup(props) {
    const store = useStickersStore()
    return () => h('button', {
      class: [
        'absolute bottom-0.5 right-0.5 w-4 h-4 rounded-md flex items-center justify-center text-[9px] leading-none transition-all z-10',
        'opacity-0 group-hover:opacity-100',
        store.isFavorite(props.url)
          ? 'bg-yellow-400/90 text-white opacity-100'
          : 'bg-black/50 text-white/70 hover:bg-yellow-400/80 hover:text-white',
      ],
      title: store.isFavorite(props.url) ? 'Убрать из избранных' : 'Добавить в избранные',
      onClick: (e: MouseEvent) => {
        e.stopPropagation()
        const pack = collection.value.find(p => p.stickers.includes(props.url))
        store.toggleFavorite(props.url, pack?.id)
      },
    }, store.isFavorite(props.url) ? '★' : '☆')
  },
})

// ── Sticker upload/import ──────────────────────────────────────────────────
const importTgsRef = ref<HTMLInputElement | null>(null)
async function importTgs(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  ;(e.target as HTMLInputElement).value = ''
  try {
    const fd = new FormData()
    fd.append('file', file, file.name)
    const res = await api.post('/media/upload?folder=stickers', fd)
    const url: string = res.data?.data?.url
    if (url) pick(url)
  } catch (err) {
    console.warn('Sticker import failed', err)
  }
}

// ── Pick sticker ───────────────────────────────────────────────────────────
function pick(url: string, pack?: StickerPack) {
  // Block paid pack stickers not owned/collected
  if (pack && parseFloat(pack.price) > 0 && !isInCollection(pack) && !ownPackIds.value.has(pack.id)) {
    openPack(pack)
    return
  }
  stickersStore.trackRecent(url)
  stickersStore.trackUsageRemote(url, pack?.id)
  if (pack) stickersStore.incrementUse(pack.id)
  emit('pick', url)
}

// ── (emoji removed — available via sticker packs) ─────────────────────────



// ── Init ───────────────────────────────────────────────────────────────────
onMounted(async () => {
  const tasks: Promise<any>[] = []
  if (!stickersStore.myCollection.length) tasks.push(stickersStore.loadMyCollection())
  if (!stickersStore.myPacks.length)      tasks.push(stickersStore.loadMyPacks())
  await Promise.all(tasks)
  // Load server-side data in background
  stickersStore.loadFavoritesFromServer()
  stickersStore.loadFrequent()
  // Default: first pack, or recent stickers if pack icons exist
  if (collection.value.length) {
    activeNav.value = collection.value[0].id
  } else if (stickersStore.recentStickers.length || stickersStore.favoriteStickers.length) {
    activeNav.value = '__fav__'
  }
})
</script>

<style scoped>
.search-slide-enter-active,
.search-slide-leave-active { transition: all 0.15s ease; }
.search-slide-enter-from,
.search-slide-leave-to    { opacity: 0; max-height: 0; padding: 0; }
.search-slide-enter-to,
.search-slide-leave-from  { opacity: 1; max-height: 52px; }

.scrollbar-hide { scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }
</style>
