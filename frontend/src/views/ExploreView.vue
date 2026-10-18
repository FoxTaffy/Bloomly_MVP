<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useTagSynonyms } from '@/composables/useTagSynonyms'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import { useAuthStore } from '@/stores/auth'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { formatCount } from '@/lib/utils'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import PostLightbox from '@/components/PostLightbox.vue'
import BIcon from '@/components/BIcon.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'

const router = useRouter()
const langStore = useLangStore()
const authStore = useAuthStore()
const { nsfwMode, nsfwEnabled } = useNsfwMode()

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|mkv|ogv)$/i.test(url.split('?')[0])

type SortKey = 'hot' | 'new'
const sortKey = ref<SortKey>('hot')
const selectedTag = ref('')
const { tagSynonyms } = useTagSynonyms()

const sortTabs = computed(() => [
  { key: 'hot' as SortKey, label: langStore.t.trending,    icon: 'TrendingUp' },
  { key: 'new' as SortKey, label: langStore.t.feedGeneral, icon: 'Clock' },
])

const PAGE_SIZE = 30
const posts         = ref<any[]>([])
const isLoading      = ref(false)
const isLoadingMore  = ref(false)
const page           = ref(1)
const hasMore        = ref(true)

interface Tile {
  key: string
  url: string
  post: any
  images: string[]
  originalImages: string[]
  startIndex: number
  ratio: number   // width / height, known before the tile is shown
  delay: number   // fade-in stagger within a batch, ms
}

function buildTiles(source: any[]): Omit<Tile, 'ratio' | 'delay'>[] {
  const list: Omit<Tile, 'ratio' | 'delay'>[] = []
  for (const post of source) {
    const media = (post.media_urls ?? []) as string[]
    const original = (post.media_original_urls ?? []) as string[]
    const imgIdxs: number[] = []
    media.forEach((u, i) => { if (!isVideoUrl(u)) imgIdxs.push(i) })
    if (!imgIdxs.length) continue
    const images = imgIdxs.map(i => media[i])
    const originalImages = imgIdxs.map(i => original[i] ?? media[i])
    imgIdxs.forEach((origIdx, localIdx) => {
      list.push({
        key: `${post.id}-${origIdx}`,
        url: media[origIdx],
        post,
        images,
        originalImages,
        startIndex: localIdx,
      })
    })
  }
  return list
}

// ── Background preloading: tiles enter the grid only once their image is decoded,
// so the layout never reflows after the fact.
function preloadTile(t: Omit<Tile, 'ratio' | 'delay'>): Promise<number | null> {
  return new Promise(resolve => {
    const img = new Image()
    const timer = setTimeout(() => resolve(null), 10000)
    const done = (r: number | null) => { clearTimeout(timer); resolve(r) }
    img.onerror = () => done(null)
    img.onload = () => {
      const r = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1
      // decode off the main thread so the paint doesn't stutter
      ;(img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => done(r))
    }
    img.src = t.url
  })
}

const shownTiles = ref<Tile[]>([])

async function preloadBatch(source: any[]): Promise<Tile[]> {
  const raw = buildTiles(source)
  const ratios = await Promise.all(raw.map(preloadTile))
  const out: Tile[] = []
  raw.forEach((t, i) => {
    const ratio = ratios[i]
    if (ratio == null) return
    out.push({ ...t, ratio: Math.min(Math.max(ratio, 0.25), 4), delay: Math.min(out.length * 25, 500) })
  })
  return out
}

// ── Masonry columns (greedy shortest-column): appending never moves existing tiles
const colCount = ref(2)
function updateColCount() {
  const w = window.innerWidth
  colCount.value = w >= 1280 ? 5 : w >= 1024 ? 4 : w >= 640 ? 3 : 2
}
let resizeRaf = 0
function onResize() {
  cancelAnimationFrame(resizeRaf)
  resizeRaf = requestAnimationFrame(updateColCount)
}

const columns = computed<Tile[][]>(() => {
  const cols: Tile[][] = Array.from({ length: colCount.value }, () => [])
  const heights = new Array(colCount.value).fill(0)
  for (const t of shownTiles.value) {
    let c = 0
    for (let i = 1; i < heights.length; i++) if (heights[i] < heights[c]) c = i
    cols[c].push(t)
    heights[c] += 1 / t.ratio
  }
  return cols
})

// Per-post viewer status (vote/repaw/favourite) — same pattern as MainLayout/ProfileView
interface PostStatus { repawed: boolean; favourited: boolean; userVote: 1 | -1 | 0 }
const postStatus = reactive<Record<string, PostStatus>>({})

async function fetchStatusFor(loadedPosts: any[]) {
  if (!authStore.isAuthenticated) return
  const ids = [...new Set(loadedPosts.map((p: any) => p.id))].filter(id => !(id in postStatus))
  if (!ids.length) return
  try {
    const res = await api.get(`/posts/status?ids=${ids.join(',')}`)
    if (res.data.success) {
      for (const s of res.data.data) {
        postStatus[s.id] = { repawed: s.repawed ?? false, favourited: s.favourited ?? false, userVote: s.userVote ?? 0 }
      }
    }
  } catch { /* non-critical */ }
}

let requestId = 0
async function fetchPosts(reset = true) {
  const myId = ++requestId
  if (reset) {
    isLoading.value = true
    page.value = 1
    hasMore.value = true
  } else {
    if (isLoadingMore.value || !hasMore.value) return
    isLoadingMore.value = true
    page.value++
  }

  try {
    const params: Record<string, string> = {
      sort: sortKey.value,
      page: String(page.value),
      limit: String(PAGE_SIZE),
      hasMedia: 'true',
    }
    params.nsfw = nsfwMode.value
    if (selectedTag.value) {
      params.tag = selectedTag.value
      params.synonyms = String(tagSynonyms.value)
    }

    const res = await api.get('/posts', { params })
    if (myId !== requestId) return
    if (res.data.success) {
      const loaded = (res.data.data.posts ?? []).filter((p: any) => p && p.author)
      hasMore.value = loaded.length === PAGE_SIZE
      fetchStatusFor(loaded)
      const batch = await preloadBatch(loaded)
      if (myId !== requestId) return
      posts.value = reset ? loaded : [...posts.value, ...loaded]
      const seen = new Set(reset ? [] : shownTiles.value.map(t => t.key))
      const fresh = batch.filter(t => !seen.has(t.key))
      shownTiles.value = reset ? fresh : [...shownTiles.value, ...fresh]
    }
  } catch (e) {
    console.error('fetchPosts', e)
  } finally {
    if (myId === requestId) {
      isLoading.value = false
      isLoadingMore.value = false
      // sentinel may still be in view after a short batch — re-check
      nextTick(rearmObserver)
    }
  }
}

// ── Infinite scroll: start loading well before the user reaches the bottom
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
function rearmObserver() {
  if (!observer || !sentinel.value) return
  observer.unobserve(sentinel.value)
  observer.observe(sentinel.value)
}

interface TrendingTag { name: string; totalCount: number; trend: 'up' | 'down' | 'stable' }
const trendingTags   = ref<TrendingTag[]>([])

async function fetchTrendingTags() {
  try {
    const res = await api.get('/posts/trending-tags', {
      params: { includeNsfw: nsfwEnabled.value ? 'true' : 'false' },
    })
    if (res.data.success) trendingTags.value = res.data.data.tags ?? []
  } catch {}
}

function selectTag(name: string) {
  selectedTag.value = selectedTag.value === name ? '' : name
}

const lightboxTile = ref<Tile | null>(null)
function openTile(tile: Tile) { lightboxTile.value = tile }

function goToProfile(username: string) {
  router.push(`/profile/${username}`)
}

watch([sortKey, selectedTag, nsfwMode], () => fetchPosts(true))
watch(tagSynonyms, () => { if (selectedTag.value) fetchPosts(true) })

onMounted(() => {
  updateColCount()
  window.addEventListener('resize', onResize, { passive: true })
  observer = new IntersectionObserver(entries => {
    if (entries.some(e => e.isIntersecting) && hasMore.value && !isLoading.value && !isLoadingMore.value) {
      fetchPosts(false)
    }
  }, { rootMargin: '1500px 0px' })
  fetchPosts(true)
  fetchTrendingTags()
})

watch(sentinel, el => { if (el && observer) observer.observe(el) })

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  cancelAnimationFrame(resizeRaf)
  observer?.disconnect()
  requestId++
})
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-[1600px] mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6">

      <!-- ─── Left sidebar ───────────────────────────────────────────── -->
      <AppSidebar />

      <!-- ─── Center: Pinterest-style tile grid ────────────────────────── -->
      <main class="flex-1 min-w-0 pb-28 md:pb-20 stack-y-5">

        <!-- Header -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 flex items-center justify-center shrink-0">
            <BIcon name="Compass" class="w-5 h-5 text-brand-accent" />
          </div>
          <h1 class="text-xl font-extrabold text-white">{{ langStore.t.explore }}</h1>
        </div>

        <!-- Sort tabs -->
        <div class="flex items-center gap-2 flex-wrap m-scroll-row max-md:-mx-3 max-md:px-3">
          <button v-for="tab in sortTabs" :key="tab.key"
            @click="sortKey = tab.key"
            class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold max-md:whitespace-nowrap transition-all"
            :class="sortKey === tab.key
              ? 'bg-brand-accent text-white shadow-md shadow-brand-accent/25'
              : 'bg-brand-card border border-brand-border text-white/55 hover:text-white hover:border-brand-accent/40'">
            <BIcon :name="tab.icon" class="w-4 h-4" />
            <span>{{ tab.label }}</span>
          </button>
          <div class="w-px h-6 bg-brand-border mx-1" :class="{ 'max-md:hidden': !selectedTag }" />
          <button v-if="selectedTag" @click="selectedTag = ''"
            class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold max-md:whitespace-nowrap bg-brand-accent/15 text-brand-accent border border-brand-accent/40">
            #{{ selectedTag }}
            <BIcon name="X" class="w-3.5 h-3.5" />
          </button>
          <button v-if="selectedTag" @click="tagSynonyms = !tagSynonyms"
            :title="'Искать также по синонимам тега (лиса → fox)'"
            class="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap border transition-all"
            :class="tagSynonyms ? 'bg-brand-accent/15 text-brand-accent border-brand-accent/40' : 'bg-brand-card text-white/55 border-brand-border hover:text-white'">
            <BIcon :name="tagSynonyms ? 'CircleCheck' : 'Circle'" class="w-3.5 h-3.5" />
            Синонимы тегов
          </button>
        </div>

        <!-- Tag chips strip -->
        <div v-if="trendingTags.length" class="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1 max-md:-mx-3 max-md:px-3">
          <button v-for="tag in trendingTags" :key="tag.name"
            @click="selectTag(tag.name)"
            class="shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap"
            :class="selectedTag === tag.name
              ? 'bg-brand-accent/15 text-brand-accent border border-brand-accent/40'
              : 'bg-brand-card border border-brand-border text-white/55 hover:text-white hover:border-white/20'">
            #{{ tag.name }}
            <span class="opacity-50">{{ formatCount(tag.totalCount) }}</span>
          </button>
        </div>

        <!-- Loading skeleton -->
        <div v-if="isLoading" class="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4">
          <div v-for="n in 16" :key="n"
            class="mb-4 break-inside-avoid rounded-2xl bg-brand-card border border-brand-border animate-pulse"
            :style="{ height: `${140 + (n % 4) * 60}px` }" />
        </div>

        <!-- Empty state -->
        <div v-else-if="shownTiles.length === 0"
          class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
          <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
            <BIcon name="Compass" class="w-10 h-10 text-white/55" />
          </div>
          <h3 class="text-2xl font-bold text-white mb-2">{{ langStore.t.noPosts }}</h3>
          <p class="text-white/55 mb-6">{{ langStore.t.beFirst }}</p>
          <button @click="router.push({ name: 'home' })"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all">
            <BIcon name="Home" class="w-4 h-4" /> {{ langStore.t.goHome }}
          </button>
        </div>

        <!-- Tile grid -->
        <template v-else>
          <div class="flex gap-4 items-start">
           <div v-for="(col, ci) in columns" :key="ci" class="flex-1 min-w-0 flex flex-col gap-4">
            <div v-for="tile in col" :key="tile.key"
              @click="openTile(tile)"
              :style="{ aspectRatio: String(tile.ratio), animationDelay: tile.delay + 'ms' }"
              class="tile-in group relative rounded-2xl overflow-hidden bg-brand-card border border-brand-border cursor-pointer shadow-xs hover:shadow-xl hover:shadow-black/40 hover:ring-2 hover:ring-brand-accent/50 hover:-translate-y-0.5 transition-all duration-200">
              <img :src="tile.url" decoding="async" class="w-full h-full object-cover block transition-transform duration-300 group-hover:scale-[1.04]" />

              <!-- Rating badge (hot sort) -->
              <div v-if="sortKey === 'hot' && tile.post.rating > 0"
                class="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 backdrop-blur-xs text-white text-[11px] font-bold">
                <BIcon name="Star" class="w-3 h-3 text-amber-400" />
                {{ formatCount(tile.post.rating) }}
              </div>

              <!-- Multi-image indicator -->
              <div v-if="tile.images.length > 1"
                class="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-xs flex items-center justify-center text-white">
                <BIcon name="Images" class="w-3 h-3" />
              </div>

              <!-- Bottom gradient overlay: author always visible, stats fade in on hover -->
              <div class="absolute inset-x-0 bottom-0 p-2.5 pt-9 flex items-end justify-between gap-2 bg-linear-to-t/srgb from-black/85 via-black/25 to-transparent">
                <div v-if="tile.post.author" class="flex items-center gap-1.5 min-w-0 cursor-pointer" @click.stop="goToProfile(tile.post.author.username)">
                  <img :src="tile.post.author.avatar_url || '/default-avatar.png'" @error="onAvatarError"
                    class="w-6 h-6 rounded-full object-cover border border-white/20 shrink-0" />
                  <span class="text-xs font-bold text-white truncate hover:text-brand-accent transition-colors">{{ tile.post.author.display_name || tile.post.author.username }}</span>
                </div>
                <router-link v-else-if="tile.post.groupPosts?.[0]?.group" :to="`/groups/${tile.post.groupPosts[0].group.slug}`" @click.stop class="flex items-center gap-1.5 min-w-0">
                  <img :src="tile.post.groupPosts[0].group.avatar_url || '/default-avatar.png'" @error="onAvatarError" class="w-6 h-6 rounded-full object-cover" />
                  <span class="text-xs font-bold text-white truncate">{{ tile.post.groupPosts[0].group.name }}</span>
                </router-link>
                <div class="flex items-center gap-2 shrink-0 text-white/85 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span v-if="tile.post._count?.comments" class="flex items-center gap-0.5 text-[11px] font-bold">
                    <BIcon name="MessageSquare" class="w-3.5 h-3.5" />
                    {{ formatCount(tile.post._count.comments) }}
                  </span>
                </div>
              </div>
            </div>
           </div>
          </div>

          <div ref="sentinel" class="flex justify-center pt-2 pb-4 min-h-10">
            <BIcon v-if="hasMore" name="Loader2" class="w-5 h-5 text-white/35 transition-opacity"
              :class="isLoadingMore ? 'animate-spin opacity-100' : 'opacity-0'" />
            <p v-else class="text-xs text-white/35 flex items-center gap-1.5">
              <BIcon name="CheckCircle" class="w-3.5 h-3.5" /> Это все посты
            </p>
          </div>
        </template>
      </main>
    </div>

    <!-- Lightbox -->
    <PostLightbox
      v-if="lightboxTile"
      :images="lightboxTile.images"
      :original-images="lightboxTile.originalImages"
      :start-index="lightboxTile.startIndex"
      :post-id="lightboxTile.post.id"
      :author="lightboxTile.post.author"
      :created-at="lightboxTile.post.created_at"
      :content="lightboxTile.post.content"
      :rating="lightboxTile.post.rating"
      :initial-vote="postStatus[lightboxTile.post.id]?.userVote ?? 0"
      :initial-repawed="postStatus[lightboxTile.post.id]?.repawed ?? false"
      :initial-favourited="postStatus[lightboxTile.post.id]?.favourited ?? false"
      :repaw-count="lightboxTile.post._count?.repaws ?? 0"
      :comments-count="lightboxTile.post._count?.comments ?? 0"
      :views-count="lightboxTile.post.views_count ?? 0"
      @voted="({ postId, vote, rating }) => {
        const p = posts.find(p => p.id === postId)
        if (p) p.rating = rating
        postStatus[postId] = { ...(postStatus[postId] ?? { repawed: false, favourited: false }), userVote: vote }
      }"
      @repaw-toggled="({ postId, repawed, count }) => {
        const p = posts.find(p => p.id === postId)
        if (p?._count) p._count.repaws = count
        postStatus[postId] = { ...(postStatus[postId] ?? { userVote: 0, favourited: false }), repawed }
      }"
      @favourite-changed="({ postId, favourited }) => {
        postStatus[postId] = { ...(postStatus[postId] ?? { userVote: 0, repawed: false }), favourited }
      }"
      @close="lightboxTile = null"
    />
  </div>
</template>

<style scoped>
.tile-in {
  animation: tile-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
@keyframes tile-in {
  from { opacity: 0; transform: translateY(10px) scale(0.98); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .tile-in { animation: none; }
}
.hide-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
