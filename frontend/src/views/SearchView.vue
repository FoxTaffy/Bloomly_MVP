<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import PostCard from '@/components/PostCard.vue'
import PersonCard from '@/components/PersonCard.vue'
import GroupCard from '@/components/groups/GroupCard.vue'
import BIcon from '@/components/BIcon.vue'
import { useTagSynonyms } from '@/composables/useTagSynonyms'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { formatCount } from '@/lib/utils'
import { useLangStore } from '@/stores/lang'
import { useFriendsStore } from '@/stores/friends'

const langStore    = useLangStore()
const friendsStore = useFriendsStore()

const { nsfwEnabled: nsfwMode } = useNsfwMode()

const route = useRoute()
const router = useRouter()

type Tab = 'all' | 'people' | 'posts' | 'groups' | 'tags'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'all', label: 'Все', icon: 'LayoutGrid' },
  { id: 'people', label: 'Люди', icon: 'Users' },
  { id: 'posts', label: 'Посты', icon: 'FileText' },
  { id: 'groups', label: 'Группы', icon: 'Users2' },
  { id: 'tags', label: 'Теги', icon: 'Hash' },
]

// Coming from the header omnibox (Enter / "Показать все результаты") always lands on Posts,
// matching VK — the dropdown itself already surfaces people/groups.
const activeTab = ref<Tab>('posts')
const query = ref((route.query.q as string) || '')
const { tagSynonyms } = useTagSynonyms()

const users = ref<any[]>([])
const groups = ref<any[]>([])
const posts = ref<any[]>([])
const tags = ref<{ name: string; count: number }[]>([])
const loading = ref(false)
const loadingMore = ref(false)

const PAGE_SIZE = 20
type Kind = 'users' | 'groups' | 'posts'
const pages: Record<Kind, number> = { users: 1, groups: 1, posts: 1 }
const hasMore = ref<Record<Kind, boolean>>({ users: false, groups: false, posts: false })

// «Релевантные» — по совпадению (тег/заголовок выше текста), «Новые» — по дате.
const postSort = ref<'relevance' | 'new'>('relevance')

let searchToken = 0 // отбрасывает ответы устаревших запросов

function endpoint(kind: Kind, enc: string, page: number) {
  if (kind === 'users') return `/users/search?q=${enc}&limit=${PAGE_SIZE}&page=${page}`
  if (kind === 'groups') return `/groups/search?q=${enc}&limit=${PAGE_SIZE}&page=${page}`
  return `/posts/search?q=${enc}&limit=${PAGE_SIZE}&page=${page}&sort=${postSort.value}&synonyms=${tagSynonyms.value}`
}
function pick(kind: Kind, res: any): any[] {
  if (!res?.data?.success) return []
  const d = res.data.data
  return (kind === 'users' ? d.users : kind === 'groups' ? d.groups : d.posts) ?? []
}

async function runSearch() {
  const q = query.value.trim()
  const token = ++searchToken
  if (!q) {
    users.value = []; groups.value = []; posts.value = []; tags.value = []
    hasMore.value = { users: false, groups: false, posts: false }
    return
  }
  loading.value = true
  pages.users = pages.groups = pages.posts = 1
  try {
    const enc = encodeURIComponent(q)
    const [usersRes, groupsRes, postsRes, tagsRes] = await Promise.all([
      api.get(endpoint('users', enc, 1)),
      api.get(endpoint('groups', enc, 1)),
      api.get(endpoint('posts', enc, 1)),
      api.get(`/posts/search/tags?q=${enc}&limit=20`).catch(() => null),
    ])
    if (token !== searchToken) return
    users.value = pick('users', usersRes)
    groups.value = pick('groups', groupsRes)
    posts.value = pick('posts', postsRes)
    tags.value = tagsRes?.data?.success ? tagsRes.data.data.tags ?? [] : []
    hasMore.value = {
      users: users.value.length >= PAGE_SIZE,
      groups: groups.value.length >= PAGE_SIZE,
      posts: posts.value.length >= PAGE_SIZE,
    }
    if (users.value.length || groups.value.length || posts.value.length || tags.value.length) rememberQuery(q)
  } catch {} finally { if (token === searchToken) loading.value = false }
}

const activeKind = computed<Kind | null>(() =>
  activeTab.value === 'people' ? 'users' : activeTab.value === 'groups' ? 'groups' : activeTab.value === 'posts' ? 'posts' : null)
const canLoadMore = computed(() => !!activeKind.value && hasMore.value[activeKind.value])

async function loadMore() {
  const kind = activeKind.value
  const q = query.value.trim()
  if (!kind || !q || loading.value || loadingMore.value || !hasMore.value[kind]) return
  const token = searchToken
  loadingMore.value = true
  try {
    const next = pages[kind] + 1
    const items = pick(kind, await api.get(endpoint(kind, encodeURIComponent(q), next)))
    if (token !== searchToken) return
    pages[kind] = next
    const target = kind === 'users' ? users : kind === 'groups' ? groups : posts
    const seen = new Set(target.value.map((x: any) => x.id))
    target.value = [...target.value, ...items.filter((x: any) => !seen.has(x.id))]
    hasMore.value[kind] = items.length >= PAGE_SIZE
  } catch {} finally { loadingMore.value = false }
}

// Бесконечная прокрутка: подгружаем, когда метка у конца списка попадает в зону видимости.
const sentinel = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null
watch(sentinel, (el) => {
  io?.disconnect()
  io = null
  if (el && 'IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore() }, { rootMargin: '500px' })
    io.observe(el)
  }
})
onBeforeUnmount(() => io?.disconnect())

// ── История запросов (только в этом браузере) ────────────────────────────────
const HISTORY_KEY = 'bloomly:searchHistory'
const history = ref<string[]>([])
try { history.value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').filter((x: unknown) => typeof x === 'string').slice(0, 8) } catch {}
function saveHistory() { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value)) } catch {} }
function rememberQuery(q: string) {
  history.value = [q, ...history.value.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8)
  saveHistory()
}
function forgetQuery(q: string) { history.value = history.value.filter((x) => x !== q); saveHistory() }
function clearHistory() { history.value = []; saveHistory() }

function submitSearch() {
  const q = query.value.trim()
  if (!q) return
  router.replace({ path: '/search', query: { q } })
}

function searchTag(name: string) {
  query.value = name
  submitSearch()
}

watch([tagSynonyms, postSort], () => { if (query.value.trim()) runSearch() })

watch(() => route.query.q, (nv) => {
  query.value = (nv as string) || ''
  runSearch()
})

const queryInput = ref<HTMLInputElement | null>(null)
onMounted(() => {
  runSearch()
  // Opened from the mobile header's search button — nothing typed yet, so go straight to the field.
  if (!query.value.trim()) queryInput.value?.focus()
})

function onPostDeleted(id: string) { posts.value = posts.value.filter((p: any) => p.id !== id) }
function onPostUpdated(p: any) { const idx = posts.value.findIndex((x: any) => x.id === p.id); if (idx !== -1) posts.value[idx] = p }

function handleMessage(userId: string) { router.push({ name: 'messages', query: { userId } }) }
async function handleRemoveFriend(userId: string) {
  if (!window.confirm(langStore.t.confirmRemoveTitle)) return
  try {
    await friendsStore.removeFriend(userId)
    const u = users.value.find((x) => x.id === userId)
    if (u) u.is_friend = false
  } catch { /* ignore */ }
}

// ── Popular hashtags — shown while there's nothing to search for yet ─────────
const trendingTags = ref<Array<{ name: string; totalCount: number }>>([])
const fetchTrendingTags = async () => {
  try {
    const res = await api.get('/posts/trending-tags', { params: { includeNsfw: nsfwMode.value ? 'true' : 'false' } })
    if (res.data.success) trendingTags.value = res.data.data.tags
  } catch {}
}
onMounted(fetchTrendingTags)
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-16 md:pt-24 px-3 md:px-4 gap-4 md:gap-6 pb-28 md:pb-10">
      <AppSidebar />

      <div class="flex-1 min-w-0 flex gap-5">
        <div class="flex-1 min-w-0 flex flex-col gap-4">

          <!-- Header / refine search -->
          <div class="bg-brand-card border border-brand-border rounded-3xl px-5 py-4 shadow-xl">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 flex items-center justify-center shrink-0">
                <BIcon name="Search" class="w-5 h-5 text-brand-accent" />
              </div>
              <div class="min-w-0">
                <h1 class="text-xl font-extrabold text-white truncate">{{ query.trim() ? 'Результаты поиска' : 'Поиск' }}</h1>
                <p v-if="query.trim()" class="text-sm text-white/55 truncate">по запросу «{{ query }}»</p>
              </div>
            </div>
            <div class="flex items-center gap-2 mt-3 bg-brand-bg border border-brand-border rounded-full py-2 pl-4 pr-2">
              <BIcon name="Search" class="w-4 h-4 text-white/40 shrink-0" />
              <input ref="queryInput" v-model="query" @keydown.enter="submitSearch" type="text" placeholder="Поиск..."
                class="flex-1 bg-transparent text-white placeholder-brand-muted text-sm outline-hidden min-w-0" />
              <button @click="submitSearch"
                class="px-4 py-1.5 rounded-full bg-brand-accent hover:bg-brand-accent-plus text-white text-xs font-semibold transition-colors shrink-0">
                Найти
              </button>
            </div>
            <button type="button" @click="tagSynonyms = !tagSynonyms"
              title="Искать также по синонимам тега (лиса → fox)"
              class="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
              :class="tagSynonyms ? 'text-brand-accent' : 'text-white/45 hover:text-white/70'">
              <BIcon :name="tagSynonyms ? 'CircleCheck' : 'Circle'" class="w-3.5 h-3.5" />
              Включать синонимы тегов
            </button>
          </div>

          <!-- Tabs -->
          <div class="flex items-center gap-1 bg-brand-card border border-brand-border rounded-2xl p-1.5 overflow-x-auto hide-scrollbar">
            <button v-for="tab in TABS" :key="tab.id" @click="activeTab = tab.id"
              :class="['flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
                activeTab === tab.id ? 'bg-brand-accent text-white shadow-xs' : 'text-white/55 hover:text-white hover:bg-white/5']">
              <BIcon :name="tab.icon" class="w-4 h-4" />{{ tab.label }}
            </button>
          </div>

          <!-- Empty query -->
          <div v-if="!query.trim()" class="flex flex-col items-center gap-6">
            <div class="w-full flex flex-col items-center justify-center py-16 text-white/55 bg-brand-card border border-brand-border rounded-3xl">
              <BIcon name="Search" class="w-10 h-10 mb-3 opacity-30" />
              <p class="text-sm">Введите запрос для поиска</p>
            </div>

            <!-- Недавние запросы -->
            <div v-if="history.length" class="w-full bg-brand-card border border-brand-border rounded-3xl p-4">
              <div class="flex items-center justify-between mb-2">
                <h2 class="text-sm font-bold text-white/80">Недавние запросы</h2>
                <button @click="clearHistory" class="text-xs text-white/45 hover:text-white font-semibold">Очистить</button>
              </div>
              <div v-for="h in history" :key="h" class="flex items-center gap-2 rounded-xl hover:bg-white/5 transition-colors">
                <button @click="searchTag(h)" class="flex-1 min-w-0 flex items-center gap-3 px-2 py-2 text-left">
                  <BIcon name="Clock" class="w-4 h-4 text-white/35 shrink-0" />
                  <span class="text-sm text-white/80 truncate">{{ h }}</span>
                </button>
                <button @click="forgetQuery(h)" title="Удалить" class="p-2 text-white/35 hover:text-white">
                  <BIcon name="X" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <!-- Popular hashtags -->
            <div v-if="trendingTags.length" class="w-full bg-brand-card border border-brand-border rounded-3xl p-4">
              <h2 class="text-sm font-bold text-white/80 mb-3">Популярные хештеги</h2>
              <div class="flex flex-wrap gap-2">
                <button v-for="tag in trendingTags" :key="tag.name" @click="searchTag(tag.name)"
                  class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-brand-bg border border-brand-border text-white/55 hover:text-white hover:border-brand-accent/40 transition-all">
                  #{{ tag.name }}
                  <span class="opacity-50">{{ formatCount(tag.totalCount) }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Loading -->
          <div v-else-if="loading" class="flex items-center justify-center py-20">
            <BIcon name="Loader2" class="w-6 h-6 text-brand-accent animate-spin" />
          </div>

          <template v-else>
            <!-- ═══ Все ═══ -->
            <template v-if="activeTab === 'all'">
              <div v-if="!users.length && !groups.length && !posts.length && !tags.length"
                class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl">
                <p class="text-white/55 text-sm">Ничего не найдено</p>
              </div>
              <template v-else>
                <div v-if="tags.length" class="bg-brand-card border border-brand-border rounded-3xl p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h2 class="text-sm font-bold text-white/80">Теги</h2>
                    <button v-if="tags.length > 6" @click="activeTab = 'tags'" class="text-xs text-brand-accent hover:text-white font-semibold">Показать все</button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button v-for="tag in tags.slice(0, 6)" :key="tag.name" @click="searchTag(tag.name)"
                      class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-brand-bg border border-brand-border text-white/70 hover:text-white hover:border-brand-accent/40 transition-all">
                      #{{ tag.name }}<span class="opacity-50">{{ formatCount(tag.count) }}</span>
                    </button>
                  </div>
                </div>

                <div v-if="users.length" class="bg-brand-card border border-brand-border rounded-3xl p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h2 class="text-sm font-bold text-white/80">Люди</h2>
                    <button @click="activeTab = 'people'" class="text-xs text-brand-accent hover:text-white font-semibold">Показать всех</button>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <router-link v-for="user in users.slice(0, 6)" :key="user.id" :to="`/profile/${user.username}`"
                      class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left">
                      <img :src="user.avatar_url || '/icons/badges/NN.jpg'"
                        class="w-10 h-10 rounded-full object-cover border border-brand-border shrink-0" @error="onAvatarError" />
                      <div class="min-w-0">
                        <p class="text-sm font-semibold text-white truncate">{{ user.display_name || user.username }}</p>
                        <p class="text-xs text-white/55 truncate">@{{ user.username }}</p>
                      </div>
                    </router-link>
                  </div>
                </div>

                <div v-if="groups.length" class="bg-brand-card border border-brand-border rounded-3xl p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h2 class="text-sm font-bold text-white/80">Группы</h2>
                    <button @click="activeTab = 'groups'" class="text-xs text-brand-accent hover:text-white font-semibold">Показать все</button>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <router-link v-for="group in groups.slice(0, 6)" :key="group.id" :to="`/groups/${group.slug || group.id}`"
                      class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left">
                      <img v-if="group.avatar_url" :src="group.avatar_url"
                        class="w-10 h-10 rounded-xl object-cover border border-brand-border shrink-0" @error="onAvatarError" />
                      <div v-else class="w-10 h-10 rounded-xl bg-brand-accent/15 border border-brand-border flex items-center justify-center text-brand-accent font-bold text-sm shrink-0">
                        {{ (group.name ?? '?')[0].toUpperCase() }}
                      </div>
                      <div class="min-w-0">
                        <p class="text-sm font-semibold text-white truncate">{{ group.name }}</p>
                        <p class="text-xs text-white/55 truncate">{{ group.members_count ?? 0 }} участников</p>
                      </div>
                    </router-link>
                  </div>
                </div>

                <div v-if="posts.length" class="flex flex-col gap-2">
                  <div class="flex items-center justify-between px-1">
                    <h2 class="text-sm font-bold text-white/80">Посты</h2>
                    <button @click="activeTab = 'posts'" class="text-xs text-brand-accent hover:text-white font-semibold">Показать все</button>
                  </div>
                  <div class="stack-y-4">
                    <PostCard v-for="post in posts.slice(0, 5)" :key="post.id" :post="post"
                      @deleted="onPostDeleted" @updated="onPostUpdated" />
                  </div>
                </div>
              </template>
            </template>

            <!-- ═══ Люди ═══ -->
            <template v-else-if="activeTab === 'people'">
              <div v-if="!users.length" class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl">
                <BIcon name="UserSearch" class="w-8 h-8 mb-2 opacity-30 mx-auto text-white/55" />
                <p class="text-white/55 text-sm">Люди не найдены</p>
              </div>
              <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PersonCard v-for="user in users" :key="user.id" :user="(user as any)" :is-friend="!!(user as any).is_friend" @message="handleMessage" @remove="handleRemoveFriend" />
              </div>
            </template>

            <!-- ═══ Посты ═══ -->
            <template v-else-if="activeTab === 'posts'">
              <div class="flex items-center gap-1.5 px-1">
                <button v-for="opt in ([['relevance', 'Релевантные'], ['new', 'Новые']] as const)" :key="opt[0]" @click="postSort = opt[0]"
                  :class="['px-3 py-1 rounded-full text-xs font-semibold transition-colors',
                    postSort === opt[0] ? 'bg-brand-accent/20 text-brand-accent' : 'text-white/55 hover:text-white']">
                  {{ opt[1] }}
                </button>
              </div>
              <div v-if="!posts.length" class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl">
                <BIcon name="FileSearch" class="w-8 h-8 mb-2 opacity-30 mx-auto text-white/55" />
                <p class="text-white/55 text-sm">Постов не найдено</p>
              </div>
              <div v-else class="stack-y-4">
                <PostCard v-for="post in posts" :key="post.id" :post="post"
                  @deleted="onPostDeleted" @updated="onPostUpdated" />
              </div>
            </template>

            <!-- ═══ Группы ═══ -->
            <template v-else-if="activeTab === 'groups'">
              <div v-if="!groups.length" class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl">
                <BIcon name="Users2" class="w-8 h-8 mb-2 opacity-30 mx-auto text-white/55" />
                <p class="text-white/55 text-sm">Группы не найдены</p>
              </div>
              <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <GroupCard v-for="group in groups" :key="group.id" :group="group" />
              </div>
            </template>

            <!-- ═══ Теги ═══ -->
            <template v-else-if="activeTab === 'tags'">
              <div v-if="!tags.length" class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl">
                <BIcon name="Hash" class="w-8 h-8 mb-2 opacity-30 mx-auto text-white/55" />
                <p class="text-white/55 text-sm">Теги не найдены</p>
              </div>
              <div v-else class="bg-brand-card border border-brand-border rounded-3xl p-2">
                <button v-for="tag in tags" :key="tag.name" @click="searchTag(tag.name)"
                  class="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-colors text-left">
                  <div class="w-10 h-10 rounded-full bg-brand-accent/15 flex items-center justify-center shrink-0">
                    <BIcon name="Hash" class="w-4 h-4 text-brand-accent" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-semibold text-white truncate">#{{ tag.name }}</p>
                    <p class="text-xs text-white/55">{{ tag.count }} постов</p>
                  </div>
                </button>
              </div>
            </template>

            <!-- Подгрузка следующей страницы -->
            <div v-if="canLoadMore" ref="sentinel" class="flex items-center justify-center py-6">
              <BIcon name="Loader2" class="w-5 h-5 text-brand-accent animate-spin" />
            </div>
          </template>

        </div>
      </div>
    </div>
  </div>
</template>
