<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import BIcon from './BIcon.vue'

const props = withDefaults(defineProps<{
  showBack?: boolean
  nsfwMode?: boolean
}>(), { showBack: false, nsfwMode: false })

const emit = defineEmits<{
  'update:nsfwMode': [val: boolean]
}>()

const router = useRouter()
const auth = useAuthStore()
const langStore = useLangStore()

// ── NSFW ─────────────────────────────────────────────────────────────────────
const toggleNsfw = () => emit('update:nsfwMode', !props.nsfwMode)

// ── Notifications ─────────────────────────────────────────────────────────────
const showNotifications = ref(false)
const notifications = ref<any[]>([])
const unreadCount = ref(0)
let notifEventSource: EventSource | null = null

const fetchUnreadCount = async () => {
  try {
    const res = await api.get('/notifications/count')
    if (res.data.success) unreadCount.value = res.data.data.count
  } catch {}
}

const fetchNotifications = async () => {
  try {
    const res = await api.get('/notifications')
    if (res.data.success) {
      notifications.value = res.data.data.notifications
      unreadCount.value = notifications.value.filter((n: any) => !n.is_read).length
    }
  } catch {}
}

const toggleNotifications = () => {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) fetchNotifications()
}

const markAllRead = async () => {
  try {
    await api.post('/notifications/read', {})
    notifications.value.forEach((n: any) => { n.is_read = true })
    unreadCount.value = 0
  } catch {}
}

const connectNotifSSE = () => {
  if (!auth.token) return
  try {
    notifEventSource = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(auth.token as string)}`)
    notifEventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type && data.type !== 'heartbeat') {
          notifications.value.unshift(data)
          unreadCount.value++
        }
      } catch {}
    }
    notifEventSource.onerror = () => { notifEventSource?.close(); notifEventSource = null }
  } catch {}
}

const notifTypeLabel = (type: string) => {
  const map: Record<string, string> = {
    LIKE: 'лайкнул(а) вашу публикацию',
    COMMENT: 'прокомментировал(а) вашу публикацию',
    REPAW: 'репостнул(а) вашу публикацию',
    FOLLOW: 'подписался(ась) на вас',
    MENTION: 'упомянул(а) вас',
    RELATIONSHIP_REQUEST:  'хочет быть вашим партнёром 💕',
    RELATIONSHIP_ACCEPTED: 'принял(а) ваш запрос в отношения ❤️',
    like: 'лайкнул(а) вашу публикацию',
    comment: 'прокомментировал(а) вашу публикацию',
    repaw: 'репостнул(а) вашу публикацию',
    follow: 'подписался(ась) на вас',
    mention: 'упомянул(а) вас',
  }
  return map[type] ?? type
}

// ── Relationship request actions ──────────────────────────────────────────────
const relActionLoading = ref<Record<string, boolean>>({})

const acceptRelationship = async (n: any) => {
  const reqId = n.ref_id
  if (!reqId) return
  relActionLoading.value[n.id] = true
  try {
    await api.post(`/relationships/${reqId}/accept`)
    n._relDone = 'accepted'
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  } catch (e: any) {
    alert(e?.response?.data?.error?.message ?? 'Ошибка')
  } finally { relActionLoading.value[n.id] = false }
}

const declineRelationship = async (n: any) => {
  const reqId = n.ref_id
  if (!reqId) return
  relActionLoading.value[n.id] = true
  try {
    await api.post(`/relationships/${reqId}/decline`)
    n._relDone = 'declined'
  } catch (e: any) {
    alert(e?.response?.data?.error?.message ?? 'Ошибка')
  } finally { relActionLoading.value[n.id] = false }
}

const onNotifClick = async (n: any) => {
  if (n.type === 'RELATIONSHIP_REQUEST') return
  showNotifications.value = false
  if (!n.is_read) {
    n.is_read = true
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    try { await api.post('/notifications/read', {}) } catch {}
  }
  if (n.post_id) { router.push(`/post/${n.post_id}`); return }
  if (n.sender?.id) router.push(`/profile/${n.sender.id}`)
}

// ── Search modal ──────────────────────────────────────────────────────────────
const showSearchModal = ref(false)
const searchModalQuery = ref('')
const searchModalTab = ref<'posts' | 'accounts'>('posts')
const searchModalPosts = ref<any[]>([])
const searchModalUsers = ref<any[]>([])
const searchModalLoading = ref(false)
let searchModalDebounce: ReturnType<typeof setTimeout>

const openSearchModal = () => {
  showSearchModal.value = true
  searchModalQuery.value = ''
  searchModalPosts.value = []
  searchModalUsers.value = []
  nextTick(() => {
    const el = document.getElementById('app-search-modal-input')
    if (el) (el as HTMLInputElement).focus()
  })
}

const closeSearchModal = () => { showSearchModal.value = false }

const onSearchModalInput = () => {
  clearTimeout(searchModalDebounce)
  if (!searchModalQuery.value.trim()) { searchModalPosts.value = []; searchModalUsers.value = []; return }
  searchModalDebounce = setTimeout(async () => {
    searchModalLoading.value = true
    try {
      if (searchModalTab.value === 'posts') {
        const res = await api.get(`/posts/search?q=${encodeURIComponent(searchModalQuery.value)}`)
        if (res.data.success) searchModalPosts.value = res.data.data.posts ?? []
      } else {
        const res = await api.get(`/users/search?q=${encodeURIComponent(searchModalQuery.value)}`)
        if (res.data.success) searchModalUsers.value = res.data.data.users ?? []
      }
    } catch {} finally { searchModalLoading.value = false }
  }, 300)
}

const searchGoToPost = (id: string) => { closeSearchModal(); router.push(`/post/${id}`) }
const searchGoToUser = (id: string) => { closeSearchModal(); router.push(`/profile/${id}`) }

// ── Keyboard ──────────────────────────────────────────────────────────────────
const onGlobalKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearchModal() }
  if (e.key === 'Escape' && showSearchModal.value) closeSearchModal()
}

// ── Logout ────────────────────────────────────────────────────────────────────
const handleLogout = () => { auth.logout(); router.push({ name: 'login' }) }

function formatDate(d: string) {
  const date = new Date(d)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}с`
  if (diff < 3600) return `${Math.floor(diff / 60)}м`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

onMounted(() => {
  if (auth.isAuthenticated) { fetchUnreadCount(); connectNotifSSE() }
  window.addEventListener('keydown', onGlobalKeydown)
})
onUnmounted(() => {
  notifEventSource?.close()
  window.removeEventListener('keydown', onGlobalKeydown)
})
</script>

<template>
  <!-- ═══════════════════════════════════════════════════════════════════════
       FIXED HEADER
  ═══════════════════════════════════════════════════════════════════════ -->
  <header class="fixed top-0 inset-x-0 h-14 md:h-16 bg-brand-bg/95 backdrop-blur-md border-b border-brand-border flex items-center justify-between px-4 md:px-6 z-40">

    <!-- Left: Logo or Back -->
    <div class="flex items-center gap-2.5">
      <button v-if="showBack" @click="router.back()"
        class="flex items-center gap-2 px-3 py-1.5 bg-brand-card border border-brand-border hover:border-brand-accent/50 rounded-xl text-sm font-semibold text-brand-muted hover:text-white transition-all">
        <BIcon name="ArrowLeft" class="w-4 h-4" />
        <span class="hidden sm:block">Назад</span>
      </button>
      <div v-else class="flex items-center gap-2.5 cursor-pointer" @click="router.push({ name: 'home' })">
        <div class="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 2C16 2 18 6 22 6C26 6 28 10 28 14C28 18 24 20 24 20C24 20 28 22 28 26C28 30 24 30 20 30C16 30 16 26 16 26C16 26 16 30 12 30C8 30 4 30 4 26C4 22 8 20 8 20C8 20 4 18 4 14C4 10 6 6 10 6C14 6 16 2 16 2Z" fill="#D5DDFF" stroke="#4C67CF" stroke-width="2" stroke-linejoin="round"/>
            <circle cx="16" cy="16" r="4" fill="#D5DDFF" stroke="#4C67CF" stroke-width="2"/>
          </svg>
        </div>
        <span class="text-xl md:text-2xl font-extrabold tracking-tight text-white">Bloomly</span>
      </div>
    </div>

    <!-- Center: Search trigger -->
    <button @click="openSearchModal"
      class="flex-1 max-w-xl mx-8 hidden md:flex items-center gap-3 bg-brand-card border border-brand-border rounded-full py-2.5 pl-4 pr-5 text-sm text-brand-muted hover:border-brand-accent/50 hover:text-white transition-colors cursor-text">
      <BIcon name="Search" class="h-4 w-4 flex-shrink-0" />
      <span class="truncate">{{ langStore.t.search }}</span>
      <span class="ml-auto flex items-center gap-1 text-xs text-brand-muted/60 bg-brand-bg px-2 py-0.5 rounded-md border border-brand-border/60 hidden xl:flex">Ctrl K</span>
    </button>

    <!-- Right: Actions -->
    <div class="flex items-center gap-1.5 md:gap-3">
      <!-- Language -->
      <select v-model="langStore.currentLang" @change="langStore.setLang(langStore.currentLang)"
        class="hidden md:block bg-brand-card border border-brand-border rounded-lg px-2 py-1 text-sm text-white outline-none focus:border-brand-accent">
        <option value="RU">RU</option>
        <option value="EN">EN</option>
        <option value="JP">JP</option>
        <option value="CN">CN</option>
      </select>

      <!-- Notifications -->
      <div class="relative">
        <button @click.stop="toggleNotifications" class="p-2 md:p-2.5 text-brand-muted hover:text-white hover:bg-white/5 rounded-full relative">
          <BIcon name="Bell" class="h-5 w-5" />
          <span v-if="unreadCount > 0" class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-brand-error rounded-full text-[10px] font-bold text-white border-2 border-brand-bg">
            {{ unreadCount > 9 ? '9+' : unreadCount }}
          </span>
        </button>
        <Transition name="filter-expand">
          <div v-if="showNotifications" @click.stop
            class="absolute right-0 top-12 z-50 w-80 bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
            <div class="flex items-center justify-between px-4 py-3 border-b border-brand-border">
              <span class="font-bold text-sm">Уведомления</span>
              <button v-if="unreadCount > 0" @click="markAllRead" class="text-xs text-brand-accent hover:text-white font-semibold">Всё прочитано</button>
            </div>
            <div class="max-h-80 overflow-y-auto">
              <div v-if="notifications.length === 0" class="py-8 text-center text-brand-muted text-sm">Нет уведомлений</div>
              <div v-for="n in notifications" :key="n.id"
                class="flex items-start gap-3 px-4 py-3 border-b border-brand-border/50 transition hover:bg-brand-border/30 cursor-pointer"
                :class="!n.is_read ? 'bg-brand-accent/5' : ''"
                @click="onNotifClick(n)">
                <img v-if="n.sender?.avatar_url" :src="n.sender.avatar_url"
                  class="w-8 h-8 rounded-full object-cover border border-brand-border flex-shrink-0 mt-0.5" />
                <div v-else class="w-8 h-8 rounded-full border border-brand-border flex-shrink-0 mt-0.5 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-xs">{{ (n.sender?.display_name || n.sender?.username || '?')[0].toUpperCase() }}</div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-white leading-snug">
                    <span class="font-bold">{{ n.sender?.display_name || n.sender?.username }}</span>
                    {{ ' ' }}{{ notifTypeLabel(n.type) }}
                  </p>
                  <p class="text-xs text-brand-muted mt-0.5">{{ formatDate(n.created_at) }}</p>
                  <!-- Relationship request accept / decline -->
                  <div v-if="n.type === 'RELATIONSHIP_REQUEST' && !n._relDone" class="flex gap-2 mt-2">
                    <button @click.stop="acceptRelationship(n)" :disabled="relActionLoading[n.id]"
                      class="flex-1 py-1 rounded-lg bg-pink-500 hover:bg-pink-400 disabled:opacity-50 text-white text-xs font-bold transition-colors">
                      Принять
                    </button>
                    <button @click.stop="declineRelationship(n)" :disabled="relActionLoading[n.id]"
                      class="flex-1 py-1 rounded-lg bg-brand-bg border border-brand-border hover:border-brand-muted disabled:opacity-50 text-brand-muted hover:text-white text-xs font-semibold transition-colors">
                      Отклонить
                    </button>
                  </div>
                  <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'accepted'" class="text-xs text-pink-400 mt-1 font-semibold">❤️ Вы приняли запрос</p>
                  <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'declined'" class="text-xs text-brand-muted mt-1">❌ Запрос отклонён</p>
                </div>
                <div v-if="!n.is_read" class="w-2 h-2 bg-brand-accent rounded-full flex-shrink-0 mt-1.5"></div>
              </div>
            </div>
          </div>
        </Transition>
      </div>

      <!-- NSFW toggle -->
      <button @click="toggleNsfw"
        class="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-full border transition-all duration-200"
        :class="nsfwMode ? 'bg-brand-error/15 border-brand-error/40 text-brand-error shadow-sm shadow-brand-error/20' : 'bg-brand-card border-brand-border text-brand-muted hover:text-white'">
        <BIcon :name="nsfwMode ? 'Eye' : 'EyeOff'" class="h-4 w-4" />
        <span class="text-xs font-bold hidden sm:block">NSFW</span>
        <div class="relative w-7 h-3.5 flex-shrink-0 hidden sm:block">
          <div class="w-7 h-3.5 rounded-full transition-colors" :class="nsfwMode ? 'bg-rose-500' : 'bg-white/20'"></div>
          <div class="absolute top-0.5 h-2.5 w-2.5 bg-white rounded-full shadow transition-all" :class="nsfwMode ? 'left-[calc(100%-11px)]' : 'left-0.5'"></div>
        </div>
      </button>

      <!-- Logout -->
      <button @click="handleLogout" class="hidden md:flex p-2.5 text-brand-muted hover:text-rose-400 hover:bg-rose-500/10 rounded-full">
        <BIcon name="LogOut" class="h-5 w-5" />
      </button>
    </div>
  </header>

  <!-- ═══════════════════════════════════════════════════════════════════════
       SEARCH MODAL (Teleported to body)
  ═══════════════════════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition name="filter-expand">
      <div v-if="showSearchModal" class="fixed inset-0 z-[500] flex items-start justify-center pt-[10vh] px-4" @click.self="closeSearchModal">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="closeSearchModal"></div>
        <div class="relative w-full max-w-2xl bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden flex flex-col" style="max-height: 78vh">
          <!-- Input row -->
          <div class="flex items-center gap-3 px-5 py-4 border-b border-brand-border flex-shrink-0">
            <BIcon name="Search" class="h-5 w-5 text-brand-muted flex-shrink-0" />
            <input id="app-search-modal-input" type="text" v-model="searchModalQuery"
              @input="onSearchModalInput" @keydown.esc="closeSearchModal"
              :placeholder="langStore.t.search"
              class="flex-1 bg-transparent text-white placeholder-brand-muted text-base outline-none" />
            <button @click="closeSearchModal" class="p-1 text-brand-muted hover:text-white transition-colors">
              <BIcon name="X" class="h-5 w-5" />
            </button>
          </div>
          <!-- Tabs -->
          <div class="flex items-center gap-1 px-5 pt-3 pb-2 border-b border-brand-border flex-shrink-0">
            <button v-for="tab in ([{ id: 'posts', icon: 'FileText', label: 'Посты' }, { id: 'accounts', icon: 'Users', label: 'Аккаунты' }] as const)"
              :key="tab.id" @click="searchModalTab = tab.id"
              :class="['flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-semibold transition-all', searchModalTab === tab.id ? 'bg-brand-accent text-white shadow-sm' : 'text-brand-muted hover:text-white hover:bg-white/5']">
              <BIcon :name="tab.icon" class="h-4 w-4" />{{ tab.label }}
            </button>
          </div>
          <!-- Results -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="!searchModalQuery.trim()" class="flex flex-col items-center justify-center py-16 text-brand-muted">
              <BIcon name="Search" class="h-10 w-10 mb-3 opacity-30" />
              <p class="text-sm">Начните вводить запрос...</p>
            </div>
            <div v-else-if="searchModalLoading" class="flex items-center justify-center py-12">
              <BIcon name="Loader2" class="h-6 w-6 text-brand-accent animate-spin" />
            </div>
            <!-- Posts -->
            <template v-else-if="searchModalTab === 'posts'">
              <div v-if="searchModalPosts.length === 0" class="flex flex-col items-center justify-center py-14 text-brand-muted">
                <BIcon name="FileSearch" class="h-8 w-8 mb-2 opacity-30" /><p class="text-sm">Постов не найдено</p>
              </div>
              <button v-for="post in searchModalPosts" :key="post.id" @click="searchGoToPost(post.id)"
                class="w-full flex items-start gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-left border-b border-brand-border/50 last:border-0">
                <img v-if="post.author?.avatar_url" :src="post.author.avatar_url"
                  class="w-9 h-9 rounded-full object-cover border border-brand-border flex-shrink-0 mt-0.5" />
                <div v-else class="w-9 h-9 rounded-full border border-brand-border flex-shrink-0 mt-0.5 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm">{{ (post.author?.display_name || post.author?.username || '?')[0].toUpperCase() }}</div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 mb-0.5">
                    <span class="text-sm font-semibold text-white">{{ post.author?.display_name || post.author?.username }}</span>
                    <span class="text-xs text-brand-muted">@{{ post.author?.username }}</span>
                    <span v-if="post.is_nsfw" class="text-[10px] font-bold bg-brand-error/20 text-brand-error px-1.5 py-0.5 rounded-full">NSFW</span>
                  </div>
                  <p class="text-sm text-brand-muted line-clamp-2 leading-snug">{{ post.content }}</p>
                </div>
                <div v-if="post.media_urls?.length" class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border border-brand-border">
                  <img :src="post.media_urls[0]" class="w-full h-full object-cover" />
                </div>
              </button>
            </template>
            <!-- Accounts -->
            <template v-else-if="searchModalTab === 'accounts'">
              <div v-if="searchModalUsers.length === 0" class="flex flex-col items-center justify-center py-14 text-brand-muted">
                <BIcon name="UserSearch" class="h-8 w-8 mb-2 opacity-30" /><p class="text-sm">Аккаунты не найдены</p>
              </div>
              <button v-for="user in searchModalUsers" :key="user.id" @click="searchGoToUser(user.id)"
                class="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/5 transition-colors text-left border-b border-brand-border/50 last:border-0">
                <img v-if="user.avatar_url" :src="user.avatar_url"
                  class="w-10 h-10 rounded-full object-cover border border-brand-border flex-shrink-0" />
                <div v-else class="w-10 h-10 rounded-full border border-brand-border flex-shrink-0 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm">{{ (user.display_name || user.username || '?')[0].toUpperCase() }}</div>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-white truncate">{{ user.display_name || user.username }}</p>
                  <p class="text-xs text-brand-muted">@{{ user.username }}</p>
                  <p v-if="user.bio" class="text-xs text-brand-muted/70 mt-0.5 line-clamp-1">{{ user.bio }}</p>
                </div>
                <div class="flex-shrink-0 text-xs text-brand-muted">
                  <span class="font-bold text-white">{{ user._count?.followers ?? 0 }}</span> подписчиков
                </div>
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
