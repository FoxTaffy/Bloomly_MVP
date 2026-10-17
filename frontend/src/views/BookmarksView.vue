<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import PostCard from '@/components/PostCard.vue'
import SkeletonPost from '@/components/SkeletonPost.vue'
import BookmarkUserCard from '@/components/BookmarkUserCard.vue'
import BookmarkGroupCard from '@/components/BookmarkGroupCard.vue'
import BIcon from '@/components/BIcon.vue'

const router = useRouter()
const auth   = useAuthStore()
const langStore = useLangStore()

// ── Click-outside directive ────────────────────────────────────────────────
const vClickOutside = {
  mounted(el: HTMLElement, binding: any) {
    ;(el as any)._clickOutside = (e: Event) => {
      if (!el.contains(e.target as Node)) binding.value(e)
    }
    document.addEventListener('click', (el as any)._clickOutside)
  },
  unmounted(el: HTMLElement) {
    document.removeEventListener('click', (el as any)._clickOutside)
  },
}

// ── Tabs & sort ────────────────────────────────────────────────────────────
type SubTab  = 'all' | 'media' | 'accounts' | 'groups'
type SortKey = 'newest' | 'oldest' | 'top'

const activeTab   = ref<SubTab>('all')
const activeSort  = ref<SortKey>('newest')
const searchQuery = ref('')
const showSortMenu = ref(false)
// null = "без метки", '' = все
const activeLabelId = ref<string | null | ''>('')

const subTabs = computed(() => [
  { key: 'all'      as SubTab, icon: 'Bookmark',   label: langStore.t.tabAll      },
  { key: 'media'    as SubTab, icon: 'Image',       label: langStore.t.tabMedia    },
  { key: 'accounts' as SubTab, icon: 'UserCircle',  label: langStore.t.tabAccounts },
  { key: 'groups'   as SubTab, icon: 'Users',       label: langStore.t.groups      },
])

const sortOptions = computed<{ key: SortKey; label: string; icon: string }[]>(() => [
  { key: 'newest', label: langStore.t.bookmarksSortNewest, icon: 'Clock'      },
  { key: 'oldest', label: langStore.t.bookmarksSortOldest, icon: 'History'    },
  { key: 'top',    label: langStore.t.bookmarksSortTop,    icon: 'TrendingUp' },
])

const activeSortLabel = computed(
  () => sortOptions.value.find(s => s.key === activeSort.value)?.label ?? '',
)

const isPostTab = computed(() => activeTab.value === 'all' || activeTab.value === 'media')

// ── Labels ─────────────────────────────────────────────────────────────────
interface Label { id: string; name: string; color: string; _count: { favourites: number } }
const labels = ref<Label[]>([])
const showCreateLabel = ref(false)
const newLabelName = ref('')
const newLabelColor = ref('#4C67CF')
const isCreatingLabel = ref(false)
const LABEL_PALETTE = [
  '#4C67CF','#7c3aed','#ec4899','#ef4444','#f97316',
  '#eab308','#22c55e','#06b6d4','#64748b','#1e293b',
]

// Label picker for assigning to a post
const labelPickerPostId = ref<string | null>(null)
const labelPickerPos = ref({ top: '0px', right: '0px' })
const isAssigning = ref(false)

async function fetchLabels() {
  try {
    const res = await api.get('/bookmarks/labels')
    if (res.data.success) labels.value = res.data.data.labels ?? []
  } catch {}
}

async function createLabel() {
  if (!newLabelName.value.trim() || isCreatingLabel.value) return
  isCreatingLabel.value = true
  try {
    const res = await api.post('/bookmarks/labels', { name: newLabelName.value.trim(), color: newLabelColor.value })
    if (res.data.success) {
      labels.value.push({ ...res.data.data.label, _count: { favourites: 0 } })
      newLabelName.value = ''
      showCreateLabel.value = false
    }
  } catch {} finally { isCreatingLabel.value = false }
}

async function deleteLabel(id: string) {
  try {
    await api.delete(`/bookmarks/labels/${id}`)
    labels.value = labels.value.filter(l => l.id !== id)
    if (activeLabelId.value === id) activeLabelId.value = ''
  } catch {}
}

function openLabelPicker(postId: string, event: MouseEvent) {
  labelPickerPostId.value = postId
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  labelPickerPos.value = {
    top: `${rect.bottom + 6}px`,
    right: `${window.innerWidth - rect.right}px`,
  }
}

async function assignLabel(postId: string, labelId: string | null) {
  if (isAssigning.value) return
  isAssigning.value = true
  try {
    await api.post(`/bookmarks/posts/${postId}/label`, { label_id: labelId })
    // Update local post label_id for immediate feedback
    const post = posts.value.find((p: any) => p.id === postId)
    if (post) post.label_id = labelId
    // Update label counts
    await fetchLabels()
    labelPickerPostId.value = null
  } catch {} finally { isAssigning.value = false }
}

// ── Post bookmarks state ───────────────────────────────────────────────────
const posts         = ref<any[]>([])
const postsTotal    = ref(0)
const postsHasMore  = ref(false)
const isPostLoading = ref(false)
const isLoadingMore = ref(false)
const PAGE_SIZE     = 20

const filteredPosts = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return posts.value
  return posts.value.filter((p: any) =>
    (p.content ?? '').toLowerCase().includes(q) ||
    (p.author?.display_name ?? '').toLowerCase().includes(q) ||
    (p.author?.username ?? '').toLowerCase().includes(q) ||
    (p.tags ?? []).some((t: any) => (t.tag?.name ?? '').toLowerCase().includes(q)),
  )
})

async function fetchPosts(reset = true) {
  if (!auth.user?.id) return
  if (reset) { isPostLoading.value = true; posts.value = []; postsTotal.value = 0; postsHasMore.value = false }
  else isLoadingMore.value = true

  try {
    const skip     = reset ? 0 : posts.value.length
    const hasMedia = activeTab.value === 'media' ? 'true' : 'false'
    const params: any = { skip, take: PAGE_SIZE, sort: activeSort.value, hasMedia }
    if (activeLabelId.value !== '') {
      params.labelId = activeLabelId.value === null ? 'none' : activeLabelId.value
    }
    const res = await api.get('/posts/me/bookmarks', { params })
    if (res.data.success) {
      const d = res.data.data
      posts.value      = reset ? (d.posts ?? []) : [...posts.value, ...(d.posts ?? [])]
      postsTotal.value  = d.total ?? 0
      postsHasMore.value = d.hasMore ?? false
    }
  } catch (e) { console.error('fetchPosts', e) }
  finally { isPostLoading.value = false; isLoadingMore.value = false }
}

function loadMore() { fetchPosts(false) }

function onFavouriteChanged(postId: string, favourited: boolean) {
  if (!favourited) { posts.value = posts.value.filter((p: any) => p.id !== postId); postsTotal.value = Math.max(0, postsTotal.value - 1) }
}
function onPostDeleted(id: string) { posts.value = posts.value.filter((p: any) => p.id !== id); postsTotal.value = Math.max(0, postsTotal.value - 1) }
function onPostUpdated(updated: any) { const i = posts.value.findIndex((p: any) => p.id === updated.id); if (i !== -1) posts.value[i] = updated }

// ── User bookmarks state ───────────────────────────────────────────────────
const bookmarkedUsers    = ref<any[]>([])
const isUsersLoading     = ref(false)
const filteredUsers = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return bookmarkedUsers.value
  return bookmarkedUsers.value.filter((u: any) =>
    (u.display_name ?? '').toLowerCase().includes(q) ||
    (u.username ?? '').toLowerCase().includes(q),
  )
})

async function fetchUsers() {
  isUsersLoading.value = true
  try {
    const res = await api.get('/bookmarks/users')
    if (res.data.success) bookmarkedUsers.value = res.data.data.users ?? []
  } catch (e) { console.error('fetchUsers', e) }
  finally { isUsersLoading.value = false }
}

function onUserUnbookmarked(id: string) { bookmarkedUsers.value = bookmarkedUsers.value.filter((u: any) => u.id !== id) }

// ── Group bookmarks state ──────────────────────────────────────────────────
const bookmarkedGroups   = ref<any[]>([])
const isGroupsLoading    = ref(false)
const filteredGroups = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return bookmarkedGroups.value
  return bookmarkedGroups.value.filter((g: any) =>
    (g.name ?? '').toLowerCase().includes(q) ||
    (g.description ?? '').toLowerCase().includes(q),
  )
})

async function fetchGroups() {
  isGroupsLoading.value = true
  try {
    const res = await api.get('/bookmarks/groups')
    if (res.data.success) bookmarkedGroups.value = res.data.data.groups ?? []
  } catch (e) { console.error('fetchGroups', e) }
  finally { isGroupsLoading.value = false }
}

function onGroupUnbookmarked(id: string) { bookmarkedGroups.value = bookmarkedGroups.value.filter((g: any) => g.id !== id) }

// ── Computed total for header ──────────────────────────────────────────────
const displayTotal = computed(() => {
  if (activeTab.value === 'accounts') return bookmarkedUsers.value.length
  if (activeTab.value === 'groups')   return bookmarkedGroups.value.length
  return postsTotal.value
})

const isLoading = computed(() => {
  if (activeTab.value === 'accounts') return isUsersLoading.value
  if (activeTab.value === 'groups')   return isGroupsLoading.value
  return isPostLoading.value
})

const mediaCount = computed(() => posts.value.filter((p: any) => p.media_urls?.length).length)

// ── Tab switching ──────────────────────────────────────────────────────────
function loadTab(tab: SubTab) {
  searchQuery.value = ''
  if (tab === 'all' || tab === 'media') fetchPosts(true)
  else if (tab === 'accounts') fetchUsers()
  else if (tab === 'groups')   fetchGroups()
}

watch(activeTab, loadTab)
watch(activeSort, () => { if (isPostTab.value) fetchPosts(true) })
watch(activeLabelId, () => { if (isPostTab.value) fetchPosts(true) })

onMounted(() => { fetchPosts(true); fetchUsers(); fetchGroups(); fetchLabels() })

// ── Refresh ───────────────────────────────────────────────────────────────
function refresh() {
  if (activeTab.value === 'accounts') fetchUsers()
  else if (activeTab.value === 'groups') fetchGroups()
  else fetchPosts(true)
}

function labelById(id: string | null) {
  if (!id) return null
  return labels.value.find(l => l.id === id) ?? null
}
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">

      <!-- ─── Left sidebar ───────────────────────────────────────────── -->
      <AppSidebar />

      <!-- ─── Center feed ───────────────────────────────────────────── -->
      <main class="flex-1 min-w-0 pb-28 md:pb-20 stack-y-4">

        <!-- Header card -->
        <div class="bg-brand-card border border-brand-border rounded-3xl px-6 py-5 max-md:px-4 max-md:py-4 shadow-xl">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-brand-yellow/15 flex items-center justify-center shrink-0">
                <BIcon name="Bookmark" class="w-5 h-5 text-brand-yellow" />
              </div>
              <div>
                <h1 class="text-xl font-extrabold text-white">{{ langStore.t.bookmarksPageTitle }}</h1>
                <p class="text-xs text-white/55 mt-0.5">
                  <span v-if="isLoading">…</span>
                  <span v-else>{{ displayTotal }} {{ langStore.t.bookmarksSaved }}</span>
                </p>
              </div>
            </div>
            <button @click="refresh" :disabled="isLoading"
              class="p-2 rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all disabled:opacity-40">
              <BIcon name="RefreshCw" class="w-4 h-4" :class="isLoading ? 'animate-spin' : ''" />
            </button>
          </div>

          <!-- Search -->
          <div class="mt-4 relative">
            <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" />
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="langStore.t.searchInBookmarks"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-white/35 outline-hidden focus:border-brand-accent/60 transition-colors"
            />
            <button v-if="searchQuery" @click="searchQuery = ''"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-white/35 hover:text-white transition-colors">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>

          <!-- Tabs + sort -->
          <div class="mt-3 flex items-center gap-2 flex-wrap">
            <div class="flex gap-1.5 flex-wrap m-scroll-row max-md:w-[calc(100%+2rem)] max-md:-mx-4 max-md:px-4">
              <button v-for="tab in subTabs" :key="tab.key"
                @click="activeTab = tab.key"
                class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold max-md:whitespace-nowrap transition-all"
                :class="activeTab === tab.key
                  ? 'bg-brand-accent text-white shadow-md shadow-brand-accent/25'
                  : 'bg-brand-bg border border-brand-border text-white/55 hover:text-white hover:border-brand-accent/40'">
                <BIcon :name="tab.icon" class="w-3.5 h-3.5" />
                <span>{{ tab.label }}</span>
              </button>
            </div>

            <div class="flex-1" />

            <!-- Sort (only for post tabs) -->
            <div v-if="isPostTab" class="relative" v-click-outside="() => showSortMenu = false">
              <button @click="showSortMenu = !showSortMenu"
                class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold bg-brand-bg border border-brand-border text-white/55 hover:text-white hover:border-brand-accent/40 transition-all">
                <BIcon name="ArrowUpDown" class="w-3.5 h-3.5" />
                <span>{{ activeSortLabel }}</span>
                <BIcon :name="showSortMenu ? 'ChevronUp' : 'ChevronDown'" class="w-3 h-3" />
              </button>
              <div v-if="showSortMenu"
                class="absolute right-0 top-full mt-1.5 z-50 w-44 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1">
                <button v-for="opt in sortOptions" :key="opt.key"
                  @click="activeSort = opt.key; showSortMenu = false"
                  class="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors"
                  :class="activeSort === opt.key ? 'text-brand-accent bg-brand-accent/10' : 'text-white/70 hover:bg-brand-bg hover:text-white'">
                  <BIcon :name="opt.icon" class="w-4 h-4" />
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>

          <!-- Label filter strip (only on post tabs) -->
          <template v-if="isPostTab && labels.length">
            <div class="mt-3 flex gap-1.5 flex-wrap items-center m-scroll-row max-md:-mx-4 max-md:px-4">
              <button
                @click="activeLabelId = ''"
                class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold max-md:whitespace-nowrap border transition-all"
                :class="activeLabelId === '' ? 'bg-brand-accent/15 text-brand-accent border-brand-accent/40' : 'text-white/50 border-brand-border hover:text-white hover:border-white/20'"
              >Все</button>
              <button
                @click="activeLabelId = null"
                class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold max-md:whitespace-nowrap border transition-all"
                :class="activeLabelId === null ? 'bg-white/10 text-white border-white/30' : 'text-white/50 border-brand-border hover:text-white hover:border-white/20'"
              >Без метки</button>
              <button
                v-for="label in labels" :key="label.id"
                @click="activeLabelId = label.id"
                class="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold max-md:whitespace-nowrap border transition-all"
                :class="activeLabelId === label.id ? 'text-white border-transparent' : 'text-white/60 border-brand-border hover:text-white'"
                :style="activeLabelId === label.id ? `background:${label.color}33;border-color:${label.color}66` : ''"
              >
                <span class="w-2 h-2 rounded-full shrink-0" :style="`background:${label.color}`" />
                {{ label.name }}
                <span class="text-[10px] opacity-60">{{ label._count.favourites }}</span>
              </button>
            </div>
          </template>
        </div>

        <!-- ── POSTS / MEDIA ─────────────────────────────────────────── -->
        <template v-if="isPostTab">
          <div v-if="isPostLoading" class="stack-y-4">
            <SkeletonPost v-for="n in 4" :key="n" />
          </div>
          <div v-else-if="filteredPosts.length === 0"
            class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
            <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
              <BIcon :name="searchQuery ? 'SearchX' : 'Bookmark'" class="w-10 h-10 text-white/55" />
            </div>
            <h3 class="text-2xl font-bold text-white mb-2">
              {{ searchQuery ? 'Ничего не найдено' : langStore.t.emptyBookmarksTitle }}
            </h3>
            <p class="text-white/55 text-sm mb-6 max-w-xs mx-auto">
              {{ searchQuery ? 'Попробуйте другой запрос'
                : activeTab === 'media' ? 'В ваших закладках пока нет постов с медиафайлами'
                : langStore.t.emptyBookmarksHint }}
            </p>
            <button v-if="!searchQuery" @click="router.push({ name: 'home' })"
              class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all">
              <BIcon name="Home" class="w-4 h-4" /> {{ langStore.t.goHome }}
            </button>
            <button v-else @click="searchQuery = ''"
              class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-card border border-brand-border text-white text-sm font-bold rounded-xl hover:border-brand-accent/40 transition-all">
              <BIcon name="X" class="w-4 h-4" /> Очистить поиск
            </button>
          </div>
          <div v-else class="stack-y-4">
            <!-- Post + label tag row -->
            <div v-for="post in filteredPosts" :key="post.id" class="relative">
              <!-- Label badge -->
              <div v-if="labelById(post.label_id)" class="flex items-center gap-1.5 mb-1.5 px-1">
                <span class="w-2 h-2 rounded-full" :style="`background:${labelById(post.label_id)!.color}`" />
                <span class="text-xs text-white/40 font-semibold">{{ labelById(post.label_id)!.name }}</span>
                <div class="relative ml-auto">
                  <button
                    @click.stop="openLabelPicker(post.id, $event)"
                    class="text-white/30 hover:text-white/60 transition-colors text-xs flex items-center gap-1">
                    <BIcon name="Tag" class="w-3 h-3" />
                    Метка
                  </button>
                </div>
              </div>
              <div v-else class="flex justify-end mb-1.5 px-1">
                <button
                  @click.stop="openLabelPicker(post.id, $event)"
                  class="text-white/25 hover:text-brand-accent/70 transition-colors text-xs flex items-center gap-1">
                  <BIcon name="Tag" class="w-3 h-3" />
                  Добавить метку
                </button>
              </div>
              <PostCard :post="post" :initial-favourited="true"
                @deleted="onPostDeleted" @updated="onPostUpdated" @favouriteChanged="onFavouriteChanged" />
            </div>
            <div v-if="!searchQuery" class="flex justify-center pt-2 pb-4">
              <button v-if="postsHasMore" @click="loadMore" :disabled="isLoadingMore"
                class="flex items-center gap-2 px-6 py-2.5 bg-brand-card border border-brand-border text-white/70 hover:text-white hover:border-brand-accent/40 text-sm font-semibold rounded-full transition-all disabled:opacity-40">
                <BIcon :name="isLoadingMore ? 'Loader2' : 'ChevronDown'" class="w-4 h-4" :class="isLoadingMore ? 'animate-spin' : ''" />
                {{ isLoadingMore ? '…' : langStore.t.bookmarksLoadMore }}
              </button>
              <p v-else-if="posts.length > 0" class="text-xs text-white/35 flex items-center gap-1.5">
                <BIcon name="CheckCircle" class="w-3.5 h-3.5" /> {{ langStore.t.bookmarksEndOfList }}
              </p>
            </div>
          </div>
        </template>

        <!-- ── ACCOUNTS ──────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'accounts'">
          <div v-if="isUsersLoading" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div v-for="n in 6" :key="n" class="bg-brand-card border border-brand-border rounded-2xl h-48 animate-pulse" />
          </div>
          <div v-else-if="filteredUsers.length === 0"
            class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
            <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
              <BIcon :name="searchQuery ? 'SearchX' : 'UserCircle'" class="w-10 h-10 text-white/55" />
            </div>
            <h3 class="text-2xl font-bold text-white mb-2">
              {{ searchQuery ? 'Ничего не найдено' : langStore.t.bookmarkedUsersEmpty }}
            </h3>
            <p class="text-white/55 text-sm mb-6 max-w-xs mx-auto">
              {{ searchQuery ? 'Попробуйте другой запрос' : langStore.t.bookmarkedUsersHint }}
            </p>
            <button v-if="searchQuery" @click="searchQuery = ''"
              class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-card border border-brand-border text-white text-sm font-bold rounded-xl hover:border-brand-accent/40 transition-all">
              <BIcon name="X" class="w-4 h-4" /> Очистить поиск
            </button>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <BookmarkUserCard v-for="user in filteredUsers" :key="user.id" :user="user" @unbookmarked="onUserUnbookmarked" />
          </div>
        </template>

        <!-- ── GROUPS ─────────────────────────────────────────────────── -->
        <template v-else-if="activeTab === 'groups'">
          <div v-if="isGroupsLoading" class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div v-for="n in 6" :key="n" class="bg-brand-card border border-brand-border rounded-2xl h-48 animate-pulse" />
          </div>
          <div v-else-if="filteredGroups.length === 0"
            class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
            <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
              <BIcon :name="searchQuery ? 'SearchX' : 'Users'" class="w-10 h-10 text-white/55" />
            </div>
            <h3 class="text-2xl font-bold text-white mb-2">
              {{ searchQuery ? 'Ничего не найдено' : langStore.t.bookmarkedGroupsEmpty }}
            </h3>
            <p class="text-white/55 text-sm mb-6 max-w-xs mx-auto">
              {{ searchQuery ? 'Попробуйте другой запрос' : langStore.t.bookmarkedGroupsHint }}
            </p>
            <button @click="router.push({ name: 'groups' })" v-if="!searchQuery"
              class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all">
              <BIcon name="Grid" class="w-4 h-4" /> {{ langStore.t.groups }}
            </button>
            <button v-else @click="searchQuery = ''"
              class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-card border border-brand-border text-white text-sm font-bold rounded-xl hover:border-brand-accent/40 transition-all">
              <BIcon name="X" class="w-4 h-4" /> Очистить поиск
            </button>
          </div>
          <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <BookmarkGroupCard v-for="group in filteredGroups" :key="group.id" :group="group" @unbookmarked="onGroupUnbookmarked" />
          </div>
        </template>

      </main>

      <!-- ─── Right panel ────────────────────────────────────────────── -->
      <aside class="w-52 hidden xl:flex flex-col gap-4 sticky top-24 self-start shrink-0">

        <!-- Filter card -->
        <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
          <div class="px-4 py-3 border-b border-brand-border">
            <h4 class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.tabAll }}</h4>
          </div>
          <nav class="p-2 stack-y-1">
            <button v-for="tab in subTabs" :key="tab.key"
              @click="activeTab = tab.key"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all"
              :class="activeTab === tab.key
                ? 'bg-brand-accent/15 text-brand-accent'
                : 'text-white/55 hover:bg-brand-bg hover:text-white'">
              <BIcon :name="tab.icon" class="w-4 h-4 shrink-0" />
              <span class="flex-1 text-left">{{ tab.label }}</span>
            </button>
          </nav>
        </div>

        <!-- Labels card -->
        <div v-if="isPostTab" class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
          <div class="px-4 py-3 border-b border-brand-border flex items-center justify-between">
            <h4 class="text-xs font-bold text-white/55 uppercase tracking-wider">Метки</h4>
            <button @click="showCreateLabel = !showCreateLabel" class="text-white/40 hover:text-brand-accent transition-colors">
              <BIcon name="Plus" class="w-3.5 h-3.5" />
            </button>
          </div>

          <!-- Create label form -->
          <div v-if="showCreateLabel" class="p-3 border-b border-brand-border/50 stack-y-2">
            <input
              v-model="newLabelName"
              @keydown.enter="createLabel"
              placeholder="Название метки"
              maxlength="60"
              class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/35 outline-hidden focus:border-brand-accent"
            />
            <div class="flex gap-1.5 flex-wrap">
              <button
                v-for="color in LABEL_PALETTE" :key="color"
                @click="newLabelColor = color"
                class="w-5 h-5 rounded-full border-2 transition-all"
                :style="`background:${color}`"
                :class="newLabelColor === color ? 'border-white scale-110' : 'border-transparent'"
              />
            </div>
            <button
              @click="createLabel"
              :disabled="!newLabelName.trim() || isCreatingLabel"
              class="w-full py-1.5 bg-brand-accent text-white text-xs font-bold rounded-xl disabled:opacity-40">
              Создать
            </button>
          </div>

          <nav class="p-2 stack-y-1">
            <button
              @click="activeLabelId = ''"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
              :class="activeLabelId === '' ? 'bg-brand-accent/15 text-brand-accent' : 'text-white/55 hover:bg-brand-bg hover:text-white'">
              <BIcon name="Bookmark" class="w-3.5 h-3.5 shrink-0" />
              <span class="flex-1 text-left">Все закладки</span>
              <span class="text-[10px] opacity-50">{{ postsTotal }}</span>
            </button>
            <button
              @click="activeLabelId = null"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
              :class="activeLabelId === null ? 'bg-white/10 text-white' : 'text-white/55 hover:bg-brand-bg hover:text-white'">
              <BIcon name="Circle" class="w-3.5 h-3.5 shrink-0" />
              <span class="flex-1 text-left">Без метки</span>
            </button>
            <div v-for="label in labels" :key="label.id"
              class="flex items-center gap-1 group/label">
              <button
                @click="activeLabelId = label.id"
                class="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all"
                :class="activeLabelId === label.id ? 'text-white' : 'text-white/55 hover:bg-brand-bg hover:text-white'"
                :style="activeLabelId === label.id ? `background:${label.color}25` : ''">
                <span class="w-3 h-3 rounded-full shrink-0" :style="`background:${label.color}`" />
                <span class="flex-1 text-left truncate">{{ label.name }}</span>
                <span class="text-[10px] opacity-50">{{ label._count.favourites }}</span>
              </button>
              <button
                @click="deleteLabel(label.id)"
                class="opacity-0 group-hover/label:opacity-100 p-1 text-white/30 hover:text-rose-400 transition-all rounded-lg">
                <BIcon name="X" class="w-3 h-3" />
              </button>
            </div>
          </nav>
        </div>

        <!-- Sort card (only for post tabs) -->
        <div v-if="isPostTab" class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
          <div class="px-4 py-3 border-b border-brand-border">
            <h4 class="text-xs font-bold text-white/55 uppercase tracking-wider">{{ langStore.t.bookmarksSort }}</h4>
          </div>
          <nav class="p-2 stack-y-1">
            <button v-for="opt in sortOptions" :key="opt.key"
              @click="activeSort = opt.key"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all"
              :class="activeSort === opt.key
                ? 'bg-brand-accent/15 text-brand-accent'
                : 'text-white/55 hover:bg-brand-bg hover:text-white'">
              <BIcon :name="opt.icon" class="w-4 h-4 shrink-0" />
              <span class="flex-1 text-left">{{ opt.label }}</span>
            </button>
          </nav>
        </div>

        <!-- Stats card -->
        <div class="bg-brand-card border border-brand-border rounded-3xl p-4 shadow-xl">
          <h4 class="text-xs font-bold text-white/55 uppercase tracking-wider mb-3">{{ langStore.t.statsTitle }}</h4>
          <div class="stack-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-white/55">{{ langStore.t.tabPosts }}</span>
              <span class="text-sm font-bold text-white">{{ postsTotal }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-white/55">{{ langStore.t.statsWithMedia }}</span>
              <span class="text-sm font-bold text-white">{{ mediaCount }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-white/55">{{ langStore.t.tabAccounts }}</span>
              <span class="text-sm font-bold text-white">{{ bookmarkedUsers.length }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-white/55">{{ langStore.t.groups }}</span>
              <span class="text-sm font-bold text-white">{{ bookmarkedGroups.length }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-white/55">Метки</span>
              <span class="text-sm font-bold text-white">{{ labels.length }}</span>
            </div>
          </div>
        </div>

      </aside>

    </div>

    <!-- Label picker popup (teleported) -->
    <Teleport to="body">
      <div
        v-if="labelPickerPostId"
        v-click-outside="() => labelPickerPostId = null"
        class="fixed z-9999 w-52 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden py-1"
        :style="{ top: labelPickerPos.top, right: labelPickerPos.right }"
      >
        <div class="px-3 py-2 border-b border-brand-border/50">
          <p class="text-xs font-bold text-white/55 uppercase tracking-wider">Выбрать метку</p>
        </div>
        <button
          @click="assignLabel(labelPickerPostId!, null)"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/5 hover:text-white transition-colors">
          <BIcon name="X" class="w-3.5 h-3.5" /> Убрать метку
        </button>
        <button
          v-for="label in labels" :key="label.id"
          @click="assignLabel(labelPickerPostId!, label.id)"
          class="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 hover:text-white transition-colors">
          <span class="w-3 h-3 rounded-full shrink-0" :style="`background:${label.color}`" />
          {{ label.name }}
        </button>
        <div v-if="!labels.length" class="px-3 py-2 text-xs text-white/35">
          Создайте метку в панели справа
        </div>
      </div>
    </Teleport>
  </div>
</template>
