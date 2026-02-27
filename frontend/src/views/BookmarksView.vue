<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import PostCard from '@/components/PostCard.vue'
import SkeletonPost from '@/components/SkeletonPost.vue'
import BIcon from '@/components/BIcon.vue'

const router = useRouter()
const auth   = useAuthStore()

// ── Sub-tab filter ────────────────────────────────────────────────────────────
type SubTab = 'all' | 'posts' | 'accounts' | 'groups' | 'media'

const activeTab = ref<SubTab>('all')

const subTabs: { key: SubTab; icon: string; label: string; disabled?: boolean }[] = [
  { key: 'all',      icon: 'Bookmark',    label: 'Все' },
  { key: 'posts',    icon: 'FileText',    label: 'Посты' },
  { key: 'accounts', icon: 'UserCircle',  label: 'Аккаунты', disabled: true },
  { key: 'groups',   icon: 'Users',       label: 'Группы',   disabled: true },
  { key: 'media',    icon: 'Image',       label: 'Медиа',    disabled: true },
]

// ── Data ──────────────────────────────────────────────────────────────────────
const allPosts     = ref<any[]>([])
const isLoading    = ref(false)

const visiblePosts = computed(() => {
  if (activeTab.value === 'media') return allPosts.value.filter((p: any) => p.media_urls?.length)
  return allPosts.value          // accounts/groups are future features — show posts
})

// ── Fetch ─────────────────────────────────────────────────────────────────────
const fetchBookmarks = async () => {
  if (!auth.user?.id) return
  isLoading.value = true
  try {
    // Use the dedicated favourites endpoint instead of fetching all posts
    const res = await api.get(`/posts/user/${auth.user.id}/likes`)
    allPosts.value = res.data.success ? (res.data.data.posts ?? []) : []
  } catch (e) {
    console.error('Failed to fetch bookmarks', e)
  } finally {
    isLoading.value = false
  }
}

onMounted(fetchBookmarks)
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">

    <AppHeader />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8">

      <!-- ─── Left: App navigation sidebar ───────────────────────────── -->
      <AppSidebar />

      <!-- ─── Center: Bookmarks feed ─────────────────────────────────── -->
      <main class="flex-1 min-w-0 pb-28 md:pb-20 space-y-4">

        <!-- Header card -->
        <div class="bg-brand-card border border-brand-border rounded-3xl px-6 py-5 shadow-xl flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-brand-yellow/15 flex items-center justify-center">
              <BIcon name="Bookmark" class="w-5 h-5 text-brand-yellow" />
            </div>
            <div>
              <h1 class="text-xl font-extrabold text-white">Закладки</h1>
              <p class="text-xs text-brand-muted mt-0.5">
                {{ isLoading ? '…' : `${visiblePosts.length} сохранено` }}
              </p>
            </div>
          </div>
          <button
            @click="fetchBookmarks"
            class="p-2 rounded-xl text-brand-muted hover:text-white hover:bg-brand-bg transition-all"
            title="Обновить">
            <BIcon name="RefreshCw" class="w-4 h-4" />
          </button>
        </div>

        <!-- Mobile sub-tabs (shown only on smaller screens where right panel is hidden) -->
        <div class="flex gap-2 overflow-x-auto hide-scrollbar xl:hidden">
          <button
            v-for="tab in subTabs"
            :key="tab.key"
            @click="!tab.disabled && (activeTab = tab.key)"
            class="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 transition-all"
            :class="tab.disabled
              ? 'opacity-40 cursor-not-allowed bg-brand-card border border-brand-border text-brand-muted'
              : activeTab === tab.key
                ? 'bg-brand-accent text-white shadow-md shadow-brand-accent/25'
                : 'bg-brand-card border border-brand-border text-brand-muted hover:text-white hover:border-brand-accent/40'">
            <BIcon :name="tab.icon" class="w-3.5 h-3.5" />
            <span>{{ tab.label }}</span>
            <BIcon v-if="tab.disabled" name="Lock" class="w-3 h-3 ml-0.5" />
          </button>
        </div>

        <!-- Loading skeletons -->
        <div v-if="isLoading" class="space-y-4">
          <SkeletonPost v-for="n in 4" :key="n" />
        </div>

        <!-- Empty state -->
        <div
          v-else-if="visiblePosts.length === 0"
          class="text-center py-20 bg-brand-card border border-brand-border rounded-3xl shadow-xl">
          <div class="w-20 h-20 bg-brand-border rounded-full flex items-center justify-center mx-auto mb-5">
            <BIcon name="Bookmark" class="w-10 h-10 text-brand-muted" />
          </div>
          <h3 class="text-2xl font-bold text-white mb-2">Закладок пока нет</h3>
          <p class="text-brand-muted text-sm mb-6">
            Нажми на иконку закладки на любом посте, чтобы сохранить его здесь
          </p>
          <button
            @click="router.push({ name: 'home' })"
            class="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-bold rounded-xl transition-all">
            <BIcon name="Home" class="w-4 h-4" />
            На главную
          </button>
        </div>

        <!-- Posts list -->
        <div v-else class="space-y-4">
          <PostCard
            v-for="post in visiblePosts"
            :key="post.id"
            :post="post"
            @deleted="(id: string) => { allPosts.value = allPosts.value.filter((p: any) => p.id !== id) }"
            @updated="(p: any) => { const idx = allPosts.value.findIndex((x: any) => x.id === p.id); if (idx !== -1) allPosts.value[idx] = p }"
          />
        </div>

      </main>

      <!-- ─── Right: Sub-groups / Filter panel ────────────────────────── -->
      <aside class="w-52 hidden xl:flex flex-col gap-4 sticky top-24 self-start flex-shrink-0">

        <!-- Filter card -->
        <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
          <div class="px-4 py-3 border-b border-brand-border">
            <h4 class="text-xs font-bold text-brand-muted uppercase tracking-wider">Категория</h4>
          </div>
          <nav class="p-2 space-y-1">
            <button
              v-for="tab in subTabs"
              :key="tab.key"
              @click="!tab.disabled && (activeTab = tab.key)"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all"
              :class="tab.disabled
                ? 'opacity-40 cursor-not-allowed text-brand-muted'
                : activeTab === tab.key
                  ? 'bg-brand-accent/15 text-brand-accent'
                  : 'text-brand-muted hover:bg-brand-bg hover:text-white'">
              <BIcon :name="tab.icon" class="w-4 h-4 flex-shrink-0" />
              <span class="flex-1 text-left">{{ tab.label }}</span>
              <BIcon v-if="tab.disabled" name="Lock" class="w-3.5 h-3.5 opacity-60" />
            </button>
          </nav>
        </div>

        <!-- Stats mini-card -->
        <div class="bg-brand-card border border-brand-border rounded-3xl p-4 shadow-xl">
          <h4 class="text-xs font-bold text-brand-muted uppercase tracking-wider mb-3">Статистика</h4>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-xs text-brand-muted">Всего сохранено</span>
              <span class="text-sm font-bold text-white">{{ allPosts.length }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs text-brand-muted">С медиа</span>
              <span class="text-sm font-bold text-white">
                {{ allPosts.filter((p: any) => p.media_urls?.length).length }}
              </span>
            </div>
          </div>
        </div>

      </aside>

    </div>
  </div>
</template>
