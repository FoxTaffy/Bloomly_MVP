<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
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
const { nsfwEnabled: nsfwMode } = useNsfwMode()

const isVideoUrl = (url: string) => /\.(mp4|webm|mov|mkv|ogv)$/i.test(url.split('?')[0])

type SortKey = 'hot' | 'new'
const sortKey = ref<SortKey>('hot')
const selectedTag = ref('')

const sortTabs = computed(() => [
  { key: 'hot' as SortKey, label: langStore.t.trending,    icon: 'Flame' },
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
}

const tiles = computed<Tile[]>(() => {
  const list: Tile[] = []
  for (const post of posts.value) {
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
})

async function fetchPosts(reset = true) {
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
    if (!nsfwMode.value) params.safeMode = 'true'
    if (selectedTag.value) params.tag = selectedTag.value

    const res = await api.get('/posts', { params })
    if (res.data.success) {
      const loaded = (res.data.data.posts ?? []).filter((p: any) => p && p.author)
      posts.value = reset ? loaded : [...posts.value, ...loaded]
      hasMore.value = loaded.length === PAGE_SIZE
    }
  } catch (e) {
    console.error('fetchPosts', e)
  } finally {
    isLoading.value = false
    isLoadingMore.value = false
  }
}

interface TrendingTag { name: string; totalCount: number; trend: 'up' | 'down' | 'stable' }
const trendingTags   = ref<TrendingTag[]>([])

async function fetchTrendingTags() {
  try {
    const res = await api.get('/posts/trending-tags', {
      params: { includeNsfw: nsfwMode.value ? 'true' : 'false' },
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

onMounted(() => {
  fetchPosts(true)
  fetchTrendingTags()
})
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-[1600px] mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6">

      <!-- ─── Left sidebar ───────────────────────────────────────────── -->
      <AppSidebar />

      <!-- ─── Center: Pinterest-style tile grid ────────────────────────── -->
      <main class="flex-1 min-w-0 pb-28 md:pb-20 space-y-5">

        <!-- Header -->
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 flex items-center justify-center flex-shrink-0">
            <BIcon name="Compass" class="w-5 h-5 text-brand-accent" />
          </div>
          <h1 class="text-xl font-extrabold text-white">{{ langStore.t.explore }}</h1>
        </div>

        <!-- Sort tabs -->
        <div class="flex items-center gap-2 flex-wrap">
          <button v-for="tab in sortTabs" :key="tab.key"
            @click="sortKey = tab.key"
            class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold transition-all"
            :class="sortKey === tab.key
              ? 'bg-brand-accent text-white shadow-md shadow-brand-accent/25'
              : 'bg-brand-card border border-brand-border text-white/55 hover:text-white hover:border-brand-accent/40'">
            <BIcon :name="tab.icon" class="w-4 h-4" />
            <span>{{ tab.label }}</span>
          </button>
          <div class="w-px h-6 bg-brand-border mx-1" />
          <button v-if="selectedTag" @click="selectedTag = ''"
            class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold bg-brand-accent/15 text-brand-accent border border-brand-accent/40">
            #{{ selectedTag }}
            <BIcon name="X" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Tag chips strip -->
        <div v-if="trendingTags.length" class="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
          <button v-for="tag in trendingTags" :key="tag.name"
            @click="selectTag(tag.name)"
            class="flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap"
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
        <div v-else-if="tiles.length === 0"
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
          <div class="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-4">
            <div v-for="tile in tiles" :key="tile.key"
              @click="openTile(tile)"
              class="mb-4 break-inside-avoid group relative rounded-2xl overflow-hidden bg-brand-card border border-brand-border cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all">
              <img :src="tile.url" loading="lazy" class="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.03]" />

              <!-- Hot score badge -->
              <div v-if="sortKey === 'hot' && tile.post.rating > 0"
                class="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold">
                <BIcon name="Flame" class="w-3 h-3 text-orange-400" />
                {{ formatCount(tile.post.rating) }}
              </div>

              <!-- Bottom gradient overlay with author -->
              <div class="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div class="flex items-center gap-2 cursor-pointer" @click.stop="goToProfile(tile.post.author.username)">
                  <img :src="tile.post.author.avatar_url || '/default-avatar.png'" @error="onAvatarError"
                    class="w-6 h-6 rounded-full object-cover border border-white/20 flex-shrink-0" />
                  <span class="text-xs font-bold text-white truncate">{{ tile.post.author.display_name || tile.post.author.username }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-center pt-2 pb-4">
            <button v-if="hasMore" @click="fetchPosts(false)" :disabled="isLoadingMore"
              class="flex items-center gap-2 px-6 py-2.5 bg-brand-card border border-brand-border text-white/70 hover:text-white hover:border-brand-accent/40 text-sm font-semibold rounded-full transition-all disabled:opacity-40">
              <BIcon :name="isLoadingMore ? 'Loader2' : 'ChevronDown'" class="w-4 h-4" :class="isLoadingMore ? 'animate-spin' : ''" />
              {{ isLoadingMore ? '…' : langStore.t.bookmarksLoadMore }}
            </button>
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
      @close="lightboxTile = null"
    />
  </div>
</template>

<style scoped>
.hide-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
