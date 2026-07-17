<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import PostCard from '@/components/PostCard.vue'
import PersonCard from '@/components/PersonCard.vue'
import GroupCard from '@/components/groups/GroupCard.vue'
import BIcon from '@/components/BIcon.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { formatCount } from '@/lib/utils'

const { nsfwEnabled: nsfwMode } = useNsfwMode()

const route = useRoute()
const router = useRouter()

type Tab = 'all' | 'people' | 'posts' | 'groups'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'all', label: 'Все', icon: 'LayoutGrid' },
  { id: 'people', label: 'Люди', icon: 'Users' },
  { id: 'posts', label: 'Посты', icon: 'FileText' },
  { id: 'groups', label: 'Группы', icon: 'Users2' },
]

// Coming from the header omnibox (Enter / "Показать все результаты") always lands on Posts,
// matching VK — the dropdown itself already surfaces people/groups.
const activeTab = ref<Tab>('posts')
const query = ref((route.query.q as string) || '')

const users = ref<any[]>([])
const groups = ref<any[]>([])
const posts = ref<any[]>([])
const loading = ref(false)

async function runSearch() {
  const q = query.value.trim()
  if (!q) { users.value = []; groups.value = []; posts.value = []; return }
  loading.value = true
  try {
    const enc = encodeURIComponent(q)
    const [usersRes, groupsRes, postsRes] = await Promise.all([
      api.get(`/users/search?q=${enc}&limit=20`),
      api.get(`/groups/search?q=${enc}&limit=20`),
      api.get(`/posts/search?q=${enc}&limit=20`),
    ])
    users.value = usersRes.data.success ? usersRes.data.data.users ?? [] : []
    groups.value = groupsRes.data.success ? groupsRes.data.data.groups ?? [] : []
    posts.value = postsRes.data.success ? postsRes.data.data.posts ?? [] : []
  } catch {} finally { loading.value = false }
}

function submitSearch() {
  const q = query.value.trim()
  if (!q) return
  router.replace({ path: '/search', query: { q } })
}

function searchTag(name: string) {
  query.value = name
  submitSearch()
}

watch(() => route.query.q, (nv) => {
  query.value = (nv as string) || ''
  runSearch()
})

onMounted(runSearch)

function onPostDeleted(id: string) { posts.value = posts.value.filter((p: any) => p.id !== id) }
function onPostUpdated(p: any) { const idx = posts.value.findIndex((x: any) => x.id === p.id); if (idx !== -1) posts.value[idx] = p }

function handleMessage(userId: string) { router.push({ name: 'messages', query: { userId } }) }

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
              <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 flex items-center justify-center flex-shrink-0">
                <BIcon name="Search" class="w-5 h-5 text-brand-accent" />
              </div>
              <div class="min-w-0">
                <h1 class="text-xl font-extrabold text-white truncate">Результаты поиска</h1>
                <p v-if="query.trim()" class="text-sm text-white/55 truncate">по запросу «{{ query }}»</p>
              </div>
            </div>
            <div class="flex items-center gap-2 mt-3 bg-brand-bg border border-brand-border rounded-full py-2 pl-4 pr-2">
              <BIcon name="Search" class="w-4 h-4 text-white/40 flex-shrink-0" />
              <input v-model="query" @keydown.enter="submitSearch" type="text" placeholder="Поиск..."
                class="flex-1 bg-transparent text-white placeholder-brand-muted text-sm outline-none min-w-0" />
              <button @click="submitSearch"
                class="px-4 py-1.5 rounded-full bg-brand-accent hover:bg-brand-accent-plus text-white text-xs font-semibold transition-colors flex-shrink-0">
                Найти
              </button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex items-center gap-1 bg-brand-card border border-brand-border rounded-2xl p-1.5 overflow-x-auto hide-scrollbar">
            <button v-for="tab in TABS" :key="tab.id" @click="activeTab = tab.id"
              :class="['flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all',
                activeTab === tab.id ? 'bg-brand-accent text-white shadow-sm' : 'text-white/55 hover:text-white hover:bg-white/5']">
              <BIcon :name="tab.icon" class="w-4 h-4" />{{ tab.label }}
            </button>
          </div>

          <!-- Empty query -->
          <div v-if="!query.trim()" class="flex flex-col items-center gap-6">
            <div class="w-full flex flex-col items-center justify-center py-16 text-white/55 bg-brand-card border border-brand-border rounded-3xl">
              <BIcon name="Search" class="w-10 h-10 mb-3 opacity-30" />
              <p class="text-sm">Введите запрос для поиска</p>
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
              <div v-if="!users.length && !groups.length && !posts.length"
                class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl">
                <p class="text-white/55 text-sm">Ничего не найдено</p>
              </div>
              <template v-else>
                <div v-if="users.length" class="bg-brand-card border border-brand-border rounded-3xl p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h2 class="text-sm font-bold text-white/80">Люди</h2>
                    <button @click="activeTab = 'people'" class="text-xs text-brand-accent hover:text-white font-semibold">Показать всех</button>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button v-for="user in users.slice(0, 6)" :key="user.id" @click="router.push(`/profile/${user.username}`)"
                      class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left">
                      <img :src="user.avatar_url || '/icons/badges/NN.jpg'"
                        class="w-10 h-10 rounded-full object-cover border border-brand-border flex-shrink-0" @error="onAvatarError" />
                      <div class="min-w-0">
                        <p class="text-sm font-semibold text-white truncate">{{ user.display_name || user.username }}</p>
                        <p class="text-xs text-white/55 truncate">@{{ user.username }}</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div v-if="groups.length" class="bg-brand-card border border-brand-border rounded-3xl p-4">
                  <div class="flex items-center justify-between mb-3">
                    <h2 class="text-sm font-bold text-white/80">Группы</h2>
                    <button @click="activeTab = 'groups'" class="text-xs text-brand-accent hover:text-white font-semibold">Показать все</button>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button v-for="group in groups.slice(0, 6)" :key="group.id" @click="router.push(`/groups/${group.slug || group.id}`)"
                      class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left">
                      <img v-if="group.avatar_url" :src="group.avatar_url"
                        class="w-10 h-10 rounded-xl object-cover border border-brand-border flex-shrink-0" @error="onAvatarError" />
                      <div v-else class="w-10 h-10 rounded-xl bg-brand-accent/15 border border-brand-border flex items-center justify-center text-brand-accent font-bold text-sm flex-shrink-0">
                        {{ (group.name ?? '?')[0].toUpperCase() }}
                      </div>
                      <div class="min-w-0">
                        <p class="text-sm font-semibold text-white truncate">{{ group.name }}</p>
                        <p class="text-xs text-white/55 truncate">{{ group.members_count ?? 0 }} участников</p>
                      </div>
                    </button>
                  </div>
                </div>

                <div v-if="posts.length" class="flex flex-col gap-2">
                  <div class="flex items-center justify-between px-1">
                    <h2 class="text-sm font-bold text-white/80">Посты</h2>
                    <button @click="activeTab = 'posts'" class="text-xs text-brand-accent hover:text-white font-semibold">Показать все</button>
                  </div>
                  <div class="space-y-4">
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
                <PersonCard v-for="user in users" :key="user.id" :user="(user as any)" @message="handleMessage" />
              </div>
            </template>

            <!-- ═══ Посты ═══ -->
            <template v-else-if="activeTab === 'posts'">
              <div v-if="!posts.length" class="text-center py-16 bg-brand-card border border-brand-border rounded-3xl">
                <BIcon name="FileSearch" class="w-8 h-8 mb-2 opacity-30 mx-auto text-white/55" />
                <p class="text-white/55 text-sm">Постов не найдено</p>
              </div>
              <div v-else class="space-y-4">
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
                <GroupCard v-for="group in groups" :key="group.id" :group="group"
                  @click="router.push(`/groups/${group.slug || group.id}`)" />
              </div>
            </template>
          </template>

        </div>
      </div>
    </div>
  </div>
</template>
