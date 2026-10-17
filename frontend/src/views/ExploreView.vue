<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
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
    params.nsfw = nsfwMode.value
    if (selectedTag.value) {
      params.tag = selectedTag.value
      params.synonyms = String(tagSynonyms.value)
    }

    const res = await api.get('/posts', { params })
    if (res.data.success) {
      const loaded = (res.data.data.posts ?? []).filter((p: any) => p && p.author)
      posts.value = reset ? loaded : [...posts.value, ...loaded]
      hasMore.value = loaded.length === PAGE_SIZE
      fetchStatusFor(loaded)
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
              class="mb-4 break-inside-avoid group relative rounded-2xl overflow-hidden bg-brand-card border border-brand-border cursor-pointer shadow-sm hover:shadow-xl hover:shadow-black/40 hover:ring-2 hover:ring-brand-accent/50 hover:-translate-y-0.5 transition-all duration-200">
              <img :src="tile.url" loading="lazy" class="w-full h-auto block transition-transform duration-300 group-hover:scale-[1.04]" />

              <!-- Rating badge (hot sort) -->
              <div v-if="sortKey === 'hot' && tile.post.rating > 0"
                class="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold">
                <BIcon name="Star" class="w-3 h-3 text-amber-400" />
                {{ formatCount(tile.post.rating) }}
              </div>

              <!-- Multi-image indicator -->
              <div v-if="tile.images.length > 1"
                class="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white">
                <BIcon name="Images" class="w-3 h-3" />
              </div>

              <!-- Bottom gradient overlay: author always visible, stats fade in on hover -->
              <div class="absolute inset-x-0 bottom-0 p-2.5 pt-9 flex items-end justify-between gap-2 bg-gradient-to-t from-black/85 via-black/25 to-transparent">
                <div class="flex items-center gap-1.5 min-w-0 cursor-pointer" @click.stop="goToProfile(tile.post.author.username)">
                  <img :src="tile.post.author.avatar_url || '/default-avatar.png'" @error="onAvatarError"
                    class="w-6 h-6 rounded-full object-cover border border-white/20 flex-shrink-0" />
                  <span class="text-xs font-bold text-white truncate hover:text-brand-accent transition-colors">{{ tile.post.author.display_name || tile.post.author.username }}</span>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0 text-white/85 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span v-if="tile.post._count?.comments" class="flex items-center gap-0.5 text-[11px] font-bold">
                    <BIcon name="MessageSquare" class="w-3.5 h-3.5" />
                    {{ formatCount(tile.post._count.comments) }}
                  </span>
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
.hide-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
