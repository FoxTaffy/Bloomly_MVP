<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useMobileSidebar } from '@/composables/useMobileSidebar'
import { onAvatarError } from '@/composables/useAvatarFallback'
import { useNotifToast } from '@/composables/useNotifToast'
import { useMessagesStore } from '@/stores/messages'
import { useWarningModalStore } from '@/stores/warningModal'
import api from '@/api'
import BIcon from './BIcon.vue'
import PostCard from './PostCard.vue'
import PostComments from './PostComments.vue'

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
const mobileSidebar = useMobileSidebar()
const messagesStore = useMessagesStore()
const warningModal = useWarningModalStore()

// ── Language picker ───────────────────────────────────────────────────────────
const showLangDropdown = ref(false)
const langOptions = [
  { code: 'RU', fi: 'ru', label: 'RU' },
  { code: 'EN', fi: 'us', label: 'EN' },
  { code: 'JP', fi: 'jp', label: 'JP' },
  { code: 'CN', fi: 'cn', label: 'CN' },
  { code: 'DE', fi: 'de', label: 'DE' },
  { code: 'FR', fi: 'fr', label: 'FR' },
  { code: 'ES', fi: 'es', label: 'ES' },
  { code: 'PT', fi: 'br', label: 'PT' },
] as const
const currentLangOption = () => langOptions.find(l => l.code === langStore.currentLang) ?? langOptions[0]
function selectLang(code: typeof langOptions[number]['code']) {
  langStore.setLang(code)
  showLangDropdown.value = false
}

// ── NSFW ─────────────────────────────────────────────────────────────────────
// `nsfwEnabled` is a global singleton (see useNsfwMode.ts) — read it directly here
// instead of relying solely on the `nsfwMode` prop, since many pages render
// <AppHeader> without wiring v-model:nsfwMode, which used to make the toggle
// look permanently OFF/inconsistent even though the underlying flag was shared.
const { nsfwEnabled, canUseNsfw, toggleNsfw: _nsfwToggle } = useNsfwMode()
const toggleNsfw = () => {
  _nsfwToggle()
  emit('update:nsfwMode', nsfwEnabled.value)
}

// ── Notifications ─────────────────────────────────────────────────────────────
const { addToast } = useNotifToast()
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

// Normalize backend field `read` → `is_read` used throughout the template
const normalizeNotif = (n: any) => ({ ...n, is_read: n.is_read ?? n.read ?? false })

const fetchNotifications = async () => {
  try {
    const res = await api.get('/notifications')
    if (res.data.success) {
      notifications.value = res.data.data.notifications.map(normalizeNotif)
      unreadCount.value = notifications.value.filter((n: any) => !n.is_read).length
    }
  } catch {}
}

const toggleNotifications = async () => {
  showNotifications.value = !showNotifications.value
  if (showNotifications.value) {
    await fetchNotifications()
    // Immediately mark all unread as read — locally + API
    const hasUnread = notifications.value.some((n: any) => !n.is_read)
    if (hasUnread) {
      notifications.value.forEach((n: any) => { n.is_read = true })
      unreadCount.value = 0
      try { await api.post('/notifications/read', {}) } catch {}
    }
  }
}

const markAllRead = async () => {
  try {
    await api.post('/notifications/read', {})
    notifications.value.forEach((n: any) => { n.is_read = true })
    unreadCount.value = 0
  } catch {}
}

let sseReconnectTimer: ReturnType<typeof setTimeout> | null = null
const connectNotifSSE = () => {
  if (!auth.token) return
  if (notifEventSource) { notifEventSource.close(); notifEventSource = null }
  try {
    notifEventSource = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(auth.token as string)}`)
    notifEventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type && data.type !== 'heartbeat') {
          const notif = data.data ?? data
          notifications.value.unshift(normalizeNotif(notif))
          unreadCount.value++
          addToast(notif)
        }
      } catch {}
    }
    notifEventSource.onerror = () => {
      notifEventSource?.close()
      notifEventSource = null
      // Auto-reconnect after 5 seconds, refreshing the token first
      if (auth.isAuthenticated || auth.user) {
        sseReconnectTimer = setTimeout(async () => {
          // Access token may have merely expired (still truthy) — always refresh before retrying
          await auth.tryRefresh()
          if (auth.token) connectNotifSSE()
        }, 5000)
      }
    }
  } catch {}
}

const notifTypeLabel = (type: string, pronouns?: string | null) => {
  // Determine gender from pronouns field: 'он/его' → male, 'она/её' → female, else neutral
  const p = (pronouns || '').toLowerCase()
  const isMale = p.startsWith('он')
  const isFemale = p.startsWith('она')

  const genderMap: Record<string, { m: string; f: string; n: string }> = {
    LIKE:    { m: 'поставил + вашей публикации',    f: 'поставила + вашей публикации',    n: 'поставил(а) + вашей публикации' },
    COMMENT: { m: 'прокомментировал вашу публикацию', f: 'прокомментировала вашу публикацию', n: 'прокомментировал(а) вашу публикацию' },
    REPAW:   { m: 'поставил RePaw вашей публикации',  f: 'поставила RePaw вашей публикации',  n: 'поставил(а) RePaw вашей публикации' },
    FOLLOW:  { m: 'подписался на вас',                 f: 'подписалась на вас',                 n: 'подписался(ась) на вас' },
    MENTION: { m: 'упомянул вас',                      f: 'упомянула вас',                      n: 'упомянул(а) вас' },
    RELATIONSHIP_REQUEST:  { m: 'хочет быть вашим партнёром 💕',  f: 'хочет быть вашим партнёром 💕',  n: 'хочет быть вашим партнёром 💕' },
    RELATIONSHIP_ACCEPTED: { m: 'принял ваш запрос в отношения ❤️', f: 'приняла ваш запрос в отношения ❤️', n: 'принял(а) ваш запрос в отношения ❤️' },
  }
  const key = type.toUpperCase()
  // These two use the localized translations dict (all 8 languages) rather than the hardcoded RU map above.
  if (key === 'FOLLOW_POST' || key === 'GROUP_POST') {
    const base = key === 'FOLLOW_POST' ? 'notifFollowPost' : 'notifGroupPost'
    const suffix = isMale ? 'M' : isFemale ? 'F' : 'N'
    return (langStore.t as any)[`${base}${suffix}`] ?? type
  }
  const entry = genderMap[key]
  if (!entry) return type
  return isMale ? entry.m : isFemale ? entry.f : entry.n
}

const notifBadgeIcon = (type: string) => {
  const map: Record<string, string> = {
    LIKE: 'Heart', like: 'Heart',
    COMMENT: 'MessageSquare', comment: 'MessageSquare',
    REPAW: 'Repeat2', repaw: 'Repeat2',
    FOLLOW: 'UserPlus', follow: 'UserPlus',
    MENTION: 'AtSign', mention: 'AtSign',
    RELATIONSHIP_REQUEST: 'HeartHandshake',
    RELATIONSHIP_ACCEPTED: 'Heart',
    FOLLOW_POST: 'FileText',
    GROUP_POST: 'FileText',
    automod_warn: 'ShieldAlert',
    automod_freeze: 'Snowflake',
    automod_unfreeze: 'Unlock',
    automod_ban: 'Ban',
    automod_clear_warns: 'CheckCircle2',
    admin_broadcast: 'Megaphone',
  }
  return map[type] ?? 'Bell'
}

const notifBadgeClass = (type: string) => {
  const map: Record<string, string> = {
    LIKE: 'bg-rose-500 text-white', like: 'bg-rose-500 text-white',
    COMMENT: 'bg-brand-accent text-white', comment: 'bg-brand-accent text-white',
    REPAW: 'bg-emerald-500 text-white', repaw: 'bg-emerald-500 text-white',
    FOLLOW: 'bg-violet-500 text-white', follow: 'bg-violet-500 text-white',
    MENTION: 'bg-amber-500 text-white', mention: 'bg-amber-500 text-white',
    RELATIONSHIP_REQUEST: 'bg-pink-500 text-white',
    RELATIONSHIP_ACCEPTED: 'bg-pink-500 text-white',
    FOLLOW_POST: 'bg-violet-500 text-white',
    GROUP_POST: 'bg-brand-accent text-white',
    automod_warn: 'bg-amber-500 text-white',
    automod_freeze: 'bg-sky-500 text-white',
    automod_unfreeze: 'bg-emerald-500 text-white',
    automod_ban: 'bg-rose-600 text-white',
    automod_clear_warns: 'bg-emerald-500 text-white',
    admin_broadcast: 'bg-brand-accent text-white',
  }
  return map[type] ?? 'bg-white/20 text-white/60'
}

// ── System (AutoMod / admin broadcast) notifications — no sender, full sentence instead of "X did Y" ──
const AUTOMOD_TYPES = ['automod_warn', 'automod_freeze', 'automod_unfreeze', 'automod_ban', 'automod_clear_warns', 'admin_broadcast']
const isAutomodNotif = (n: any) => AUTOMOD_TYPES.includes(n.type)

const automodMessage = (n: any) => {
  const meta = n.meta || {}
  switch (n.type) {
    case 'automod_warn':
      return `⚠️ Предупреждение ${meta.count ?? '?'} из ${meta.limit ?? 5}${meta.reason ? ' — ' + meta.reason : ''}`
    case 'automod_freeze':
      return `🧊 Аккаунт временно заморожен${meta.reason ? ' — ' + meta.reason : ''}`
    case 'automod_unfreeze':
      return '🔓 Заморозка снята, аккаунт снова активен'
    case 'automod_ban':
      return `🚫 Аккаунт заблокирован${meta.reason ? ' — ' + meta.reason : ''}`
    case 'automod_clear_warns':
      return '✅ Предупреждения сброшены модератором'
    case 'admin_broadcast':
      return `📣 ${meta.title ?? ''}${meta.body ? ' — ' + meta.body : ''}`
    default:
      return ''
  }
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

// ── Post modal ───────────────────────────────────────────────────────────────
const postModal = ref<{ id: string; data: any | null; loading: boolean } | null>(null)

const openPostModal = async (postId: string) => {
  postModal.value = { id: postId, data: null, loading: true }
  try {
    const res = await api.get(`/posts/${postId}`)
    if (res.data.success) postModal.value.data = res.data.data.post
  } catch {
    postModal.value = null
  } finally {
    if (postModal.value) postModal.value.loading = false
  }
}

const closePostModal = () => { postModal.value = null }

const POST_TYPES = ['LIKE', 'COMMENT', 'REPAW', 'MENTION', 'FOLLOW_POST', 'GROUP_POST', 'like', 'comment', 'repaw', 'mention', 'automod_ban']
const PROFILE_TYPES = ['FOLLOW', 'RELATIONSHIP_ACCEPTED', 'follow', 'relationship_accepted']

// ── Display identity for a notification — real user, or the group it was sent "as" ──
const identityAvatar = (n: any): string | null => n.senderGroup?.avatar_url ?? n.sender?.avatar_url ?? null
const identityName = (n: any): string => n.senderGroup?.name || n.sender?.display_name || n.sender?.username || ''
const identityHref = (n: any): string => {
  if (n.senderGroup?.slug) return `/groups/${n.senderGroup.slug}`
  return '/profile/' + (n.sender?.username ?? '')
}

const onNotifClick = async (n: any) => {
  if (n.type === 'RELATIONSHIP_REQUEST') return
  // Mark this single notification as read
  if (!n.is_read) {
    n.is_read = true
    unreadCount.value = Math.max(0, unreadCount.value - 1)
    try { await api.post('/notifications/read', { ids: [n.id] }) } catch {}
  }
  // Warning notifications open the violation detail modal built from `meta` —
  // never the post itself, since the reported post is very often already deleted
  // (openPostModal would 404 silently and the click would appear to do nothing).
  if (n.type === 'automod_warn') {
    showNotifications.value = false
    warningModal.open(n)
    return
  }
  // Open post modal
  if (POST_TYPES.includes(n.type) && n.post_id) {
    showNotifications.value = false
    openPostModal(n.post_id)
    return
  }
  // Open sender profile
  if (PROFILE_TYPES.includes(n.type) && n.sender?.username) {
    showNotifications.value = false
    router.push(`/profile/${n.sender.username}`)
    return
  }
  // Fallback: navigate to post page
  if (n.post_id) { showNotifications.value = false; router.push(`/post/${n.post_id}`) }
}

// ── Search modal (VK-style: live "Люди" + "Группы" preview, Enter/"show all" → /search) ──
const showSearchModal = ref(false)
const searchModalQuery = ref('')
const searchModalUsers = ref<any[]>([])
const searchModalGroups = ref<any[]>([])
const searchModalLoading = ref(false)
let searchModalDebounce: ReturnType<typeof setTimeout>

const openSearchModal = () => {
  showSearchModal.value = true
  nextTick(() => {
    const el = document.getElementById('app-search-modal-input')
    if (el) (el as HTMLInputElement).focus()
  })
}

const closeSearchModal = () => { showSearchModal.value = false }

const clearSearchModal = () => {
  searchModalQuery.value = ''
  searchModalUsers.value = []
  searchModalGroups.value = []
  const el = document.getElementById('app-search-modal-input')
  if (el) (el as HTMLInputElement).focus()
}

const onSearchModalInput = () => {
  clearTimeout(searchModalDebounce)
  if (!searchModalQuery.value.trim()) { searchModalUsers.value = []; searchModalGroups.value = []; return }
  searchModalDebounce = setTimeout(async () => {
    searchModalLoading.value = true
    try {
      const q = encodeURIComponent(searchModalQuery.value)
      const [usersRes, groupsRes] = await Promise.all([
        api.get(`/users/search?q=${q}&limit=5`),
        api.get(`/groups/search?q=${q}&limit=5`),
      ])
      if (usersRes.data.success) searchModalUsers.value = usersRes.data.data.users ?? []
      if (groupsRes.data.success) searchModalGroups.value = groupsRes.data.data.groups ?? []
    } catch {} finally { searchModalLoading.value = false }
  }, 300)
}

// ── Default suggestions (shown when the search is opened but nothing is typed yet) ──
const defaultSearchUsers = ref<any[]>([])
const defaultSearchGroups = ref<any[]>([])

const fetchDefaultSearchSuggestions = async () => {
  try {
    const [usersRes, groupsRes] = await Promise.all([
      api.get('/users/recommended'),
      api.get('/groups/trending?limit=3'),
    ])
    if (usersRes.data.success) defaultSearchUsers.value = (usersRes.data.data.users ?? []).slice(0, 3)
    if (groupsRes.data.success) defaultSearchGroups.value = (groupsRes.data.data.groups ?? []).slice(0, 3)
  } catch {}
}

const goToFullSearch = () => {
  const q = searchModalQuery.value.trim()
  if (!q) return
  closeSearchModal()
  router.push({ path: '/search', query: { q } })
}

// ── Stories (inside search modal) ─────────────────────────────────────────────
const searchStories = ref<any[]>([])
const activeStory = ref<any>(null)
const storyProgress = ref(0)
let storyTimerInterval: ReturnType<typeof setInterval> | null = null

const fetchSearchStories = async () => {
  try {
    const res = await api.get('/stories')
    if (res.data.success) searchStories.value = res.data.data.stories
  } catch {}
}

const openStory = (story: any) => {
  activeStory.value = story
  storyProgress.value = 0
  if (storyTimerInterval) clearInterval(storyTimerInterval)
  const start = Date.now()
  storyTimerInterval = setInterval(() => {
    storyProgress.value = Math.min(100, ((Date.now() - start) / 5000) * 100)
    if (storyProgress.value >= 100) closeStory()
  }, 50)
}

const closeStory = () => {
  activeStory.value = null
  storyProgress.value = 0
  if (storyTimerInterval) { clearInterval(storyTimerInterval); storyTimerInterval = null }
}

// ── Click-outside handler ─────────────────────────────────────────────────────
const onDocumentClick = () => {
  showLangDropdown.value = false
  showNotifications.value = false
  showSearchModal.value = false
}

// ── Keyboard ──────────────────────────────────────────────────────────────────
const onGlobalKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openSearchModal() }
  if (e.key === 'Escape' && postModal.value) { closePostModal(); return }
  if (e.key === 'Escape' && showNotifications.value) { showNotifications.value = false; return }
  if (e.key === 'Escape' && showSearchModal.value) closeSearchModal()
}

// ── Logout ────────────────────────────────────────────────────────────────────
// Ждём очистки сессии: иначе guard видит ещё живой токен и редиректит с /login обратно на главную
const handleLogout = async () => { await auth.logout(); router.push({ name: 'login' }) }

function formatDate(d: string) {
  const date = new Date(d)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}с`
  if (diff < 3600) return `${Math.floor(diff / 60)}м`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч`
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

onMounted(() => {
  if (auth.isAuthenticated) {
    fetchUnreadCount(); connectNotifSSE(); fetchSearchStories(); fetchDefaultSearchSuggestions()
    // Keep the chat WS subscription alive app-wide, not just while the Messages page is open —
    // otherwise incoming messages are silently dropped (no handler registered) until the user
    // happens to navigate back to /messages.
    messagesStore.startListening()
    messagesStore.fetchUnreadCount()
  }
  window.addEventListener('keydown', onGlobalKeydown)
  document.addEventListener('click', onDocumentClick)
})
onUnmounted(() => {
  notifEventSource?.close()
  if (sseReconnectTimer) clearTimeout(sseReconnectTimer)
  if (storyTimerInterval) clearInterval(storyTimerInterval)
  window.removeEventListener('keydown', onGlobalKeydown)
  document.removeEventListener('click', onDocumentClick)
})
</script>

<template>
  <!-- ═══════════════════════════════════════════════════════════════════════
       FIXED HEADER
  ═══════════════════════════════════════════════════════════════════════ -->
  <header class="fixed top-0 inset-x-0 h-14 md:h-16 bg-brand-bg/95 backdrop-blur-md border-b border-brand-border flex items-center justify-between px-4 md:px-6 z-40">

    <!-- Left: Logo or Back -->
    <div class="flex items-center gap-2.5">
      <!-- Mobile hamburger (only when sidebar is present, < lg) -->
      <button v-if="auth.isAuthenticated && !showBack"
        @click="mobileSidebar.toggle()"
        class="lg:hidden p-2 rounded-xl text-white/55 hover:text-white hover:bg-white/5 transition-all flex-shrink-0">
        <BIcon :name="mobileSidebar.isOpen.value ? 'X' : 'Menu'" class="w-5 h-5" />
      </button>
      <button v-if="showBack" @click="router.back()"
        class="flex items-center gap-2 px-3 py-1.5 bg-brand-card border border-brand-border hover:border-brand-accent/50 rounded-xl text-sm font-semibold text-white/55 hover:text-white transition-all">
        <BIcon name="ArrowLeft" class="w-4 h-4" />
        <span class="hidden sm:block">Назад</span>
      </button>
      <router-link v-else :to="{ name: 'home' }" class="flex items-center gap-2.5 cursor-pointer">
        <div class="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center flex-shrink-0">
          <img src="/bloomly.png?v=2" alt="Bloomly" class="w-full h-full object-contain" />
        </div>
        <span class="text-xl md:text-2xl font-extrabold tracking-tight text-white">Bloomly</span>
        <span class="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide bg-brand-accent/15 text-brand-accent border border-brand-accent/30 leading-none">бета 5.2.255</span>
      </router-link>
    </div>

    <!-- Center: Search -->
    <div class="relative flex-1 max-w-xl mx-8 hidden md:block" @click.stop>
      <div class="flex items-center gap-3 bg-brand-card border rounded-full py-2.5 pl-4 pr-4 text-sm transition-colors"
        :class="showSearchModal ? 'border-brand-accent/60 ring-2 ring-brand-accent/15' : 'border-brand-border'">
        <BIcon name="Search" class="h-4 w-4 flex-shrink-0 text-white/55" />
        <input id="app-search-modal-input" type="text" v-model="searchModalQuery"
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
          @focus="openSearchModal" @input="onSearchModalInput"
          @keydown.esc="closeSearchModal" @keydown.enter="goToFullSearch"
          :placeholder="langStore.t.search"
          class="flex-1 min-w-0 bg-transparent text-white placeholder-white/55 outline-none" />
        <button v-if="searchModalQuery" @click="clearSearchModal"
          class="p-0.5 text-white/40 hover:text-white transition-colors flex-shrink-0">
          <BIcon name="X" class="h-3.5 w-3.5" />
        </button>
        <span v-else class="ml-auto flex items-center gap-1 text-xs text-white/35 bg-brand-bg px-2 py-0.5 rounded-md border border-brand-border/60 hidden xl:flex flex-shrink-0">Ctrl K</span>
      </div>

      <!-- Search dropdown -->
      <Transition name="filter-expand">
        <div v-if="showSearchModal"
          class="absolute top-full left-0 right-0 mt-2 bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden flex flex-col z-50 origin-top"
          style="max-height: 70vh">
          <!-- Results -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="!searchModalQuery.trim()" class="p-4">
              <!-- Stories bar -->
              <div v-if="searchStories.length" class="mb-4">
                <p class="text-[10px] font-bold uppercase tracking-widest text-white/35 mb-3 px-1">Истории</p>
                <div class="flex gap-3 overflow-x-auto hide-scrollbar pb-1">
                  <div v-for="story in searchStories" :key="story.id"
                    class="flex flex-col items-center gap-1.5 cursor-pointer flex-shrink-0"
                    @click="openStory(story)">
                    <div class="w-14 h-14 rounded-2xl p-[2px] bg-gradient-to-tr from-brand-accent to-brand-purple">
                      <img v-if="story.user.avatar_url" :src="story.user.avatar_url"
                        class="w-full h-full rounded-xl border-2 border-brand-card object-cover"
                        @error="onAvatarError" />
                      <div v-else class="w-full h-full rounded-xl border-2 border-brand-card bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm">
                        {{ (story.user.username ?? '?')[0].toUpperCase() }}
                      </div>
                    </div>
                    <span class="text-[10px] font-semibold text-white/55 max-w-[56px] truncate">{{ story.user.username }}</span>
                  </div>
                </div>
              </div>

              <!-- Recommended people -->
              <div v-if="defaultSearchUsers.length" class="flex flex-col gap-2 mb-4">
                <p class="text-[10px] font-bold uppercase tracking-widest text-white/35 px-1">Люди</p>
                <router-link v-for="user in defaultSearchUsers" :key="user.id" :to="`/profile/${user.username}`" @click="closeSearchModal()"
                  class="w-full flex items-center gap-3 p-3 bg-brand-bg/60 border border-brand-border rounded-2xl hover:border-brand-accent/40 transition-all text-left">
                  <img :src="user.avatar_url || '/icons/badges/NN.jpg'"
                    class="w-10 h-10 rounded-full object-cover border border-brand-border flex-shrink-0"
                    @error="onAvatarError" />
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-white truncate">{{ user.display_name || user.username }}</p>
                    <p class="text-xs text-white/55">@{{ user.username }}</p>
                  </div>
                </router-link>
              </div>

              <!-- Recommended groups -->
              <div v-if="defaultSearchGroups.length" class="flex flex-col gap-2">
                <p class="text-[10px] font-bold uppercase tracking-widest text-white/35 px-1">Группы</p>
                <router-link v-for="group in defaultSearchGroups" :key="group.id" :to="`/groups/${group.slug || group.id}`" @click="closeSearchModal()"
                  class="w-full flex items-center gap-3 p-3 bg-brand-bg/60 border border-brand-border rounded-2xl hover:border-brand-accent/40 transition-all text-left">
                  <img v-if="group.avatar_url" :src="group.avatar_url"
                    class="w-10 h-10 rounded-xl object-cover border border-brand-border flex-shrink-0"
                    @error="onAvatarError" />
                  <div v-else class="w-10 h-10 rounded-xl bg-brand-accent/15 border border-brand-border flex items-center justify-center text-brand-accent font-bold text-sm flex-shrink-0">
                    {{ (group.name ?? '?')[0].toUpperCase() }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-white truncate flex items-center gap-1">
                      {{ group.name }}
                      <BIcon v-if="group.is_verified" name="BadgeCheck" class="h-3.5 w-3.5 text-brand-accent flex-shrink-0" />
                    </p>
                    <p class="text-xs text-white/55">{{ group.members_count ?? 0 }} участников</p>
                  </div>
                </router-link>
              </div>

              <!-- Nothing to suggest at all -->
              <div v-if="!searchStories.length && !defaultSearchUsers.length && !defaultSearchGroups.length"
                class="flex flex-col items-center justify-center py-10 text-white/55">
                <BIcon name="Search" class="h-10 w-10 mb-3 opacity-30" />
                <p class="text-sm">Начните вводить запрос...</p>
              </div>
            </div>
            <div v-else-if="searchModalLoading" class="flex items-center justify-center py-12">
              <BIcon name="Loader2" class="h-6 w-6 text-brand-accent animate-spin" />
            </div>
            <!-- Live preview: Люди first, then Группы (VK-style) -->
            <template v-else>
              <div v-if="searchModalUsers.length === 0 && searchModalGroups.length === 0"
                class="flex flex-col items-center justify-center py-14 text-white/55">
                <BIcon name="SearchX" class="h-8 w-8 mb-2 opacity-30" /><p class="text-sm">Ничего не найдено</p>
              </div>
              <template v-else>
                <!-- Люди -->
                <div v-if="searchModalUsers.length" class="px-3 pt-3 flex flex-col gap-2">
                  <p class="text-[10px] font-bold uppercase tracking-widest text-white/35 px-1">Люди</p>
                  <router-link v-for="user in searchModalUsers" :key="user.id" :to="`/profile/${user.username}`" @click="closeSearchModal()"
                    class="w-full flex items-center gap-3 p-3 bg-brand-bg/60 border border-brand-border rounded-2xl hover:border-brand-accent/40 transition-all text-left">
                    <img :src="user.avatar_url || '/icons/badges/NN.jpg'"
                      class="w-10 h-10 rounded-full object-cover border border-brand-border flex-shrink-0"
                      @error="onAvatarError" />
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-semibold text-white truncate">{{ user.display_name || user.username }}</p>
                      <p class="text-xs text-white/55">@{{ user.username }}</p>
                    </div>
                  </router-link>
                </div>
                <!-- Группы -->
                <div v-if="searchModalGroups.length" class="px-3 pt-3 pb-3 flex flex-col gap-2">
                  <p class="text-[10px] font-bold uppercase tracking-widest text-white/35 px-1">Группы</p>
                  <router-link v-for="group in searchModalGroups" :key="group.id" :to="`/groups/${group.slug || group.id}`" @click="closeSearchModal()"
                    class="w-full flex items-center gap-3 p-3 bg-brand-bg/60 border border-brand-border rounded-2xl hover:border-brand-accent/40 transition-all text-left">
                    <img v-if="group.avatar_url" :src="group.avatar_url"
                      class="w-10 h-10 rounded-xl object-cover border border-brand-border flex-shrink-0"
                      @error="onAvatarError" />
                    <div v-else class="w-10 h-10 rounded-xl bg-brand-accent/15 border border-brand-border flex items-center justify-center text-brand-accent font-bold text-sm flex-shrink-0">
                      {{ (group.name ?? '?')[0].toUpperCase() }}
                    </div>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-semibold text-white truncate flex items-center gap-1">
                        {{ group.name }}
                        <BIcon v-if="group.is_verified" name="BadgeCheck" class="h-3.5 w-3.5 text-brand-accent flex-shrink-0" />
                      </p>
                      <p class="text-xs text-white/55">{{ group.members_count ?? 0 }} участников</p>
                    </div>
                  </router-link>
                </div>
              </template>
              <!-- Show all results -->
              <router-link :to="{ path: '/search', query: { q: searchModalQuery.trim() } }" @click="closeSearchModal()"
                class="w-full flex items-center justify-center gap-2 px-5 py-3.5 border-t border-brand-border text-sm font-semibold text-brand-accent hover:bg-brand-accent/5 transition-colors">
                <BIcon name="Search" class="h-4 w-4" />
                Показать все результаты
              </router-link>
            </template>
          </div>
        </div>
      </Transition>
    </div>

    <!-- Right: Actions -->
    <div class="flex items-center gap-1.5 md:gap-3">
      <!-- Language picker (desktop only) -->
      <div class="relative hidden md:block">
        <button @click.stop="showLangDropdown = !showLangDropdown"
          class="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand-card border border-brand-border rounded-xl text-sm font-bold text-white/80 hover:text-white hover:border-brand-accent/50 transition-all">
          <span :class="`fi fi-${currentLangOption().fi} rounded-sm`" style="font-size:1.1rem"></span>
          <span class="hidden sm:inline text-xs">{{ currentLangOption().label }}</span>
          <BIcon name="ChevronDown" class="w-3 h-3 text-white/40" />
        </button>
        <Transition name="filter-expand">
          <div v-if="showLangDropdown" @click.stop
            class="absolute right-0 top-10 z-50 bg-brand-card border border-brand-border rounded-2xl shadow-2xl overflow-hidden min-w-[120px]">
            <button
              v-for="lang in langOptions" :key="lang.code"
              @click="selectLang(lang.code)"
              class="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-semibold transition-colors hover:bg-brand-accent/10"
              :class="langStore.currentLang === lang.code ? 'text-brand-accent bg-brand-accent/5' : 'text-white/70 hover:text-white'">
              <span :class="`fi fi-${lang.fi} rounded-sm`" style="font-size:1.1rem"></span>
              <span>{{ lang.label }}</span>
              <BIcon v-if="langStore.currentLang === lang.code" name="Check" class="w-3.5 h-3.5 ml-auto" />
            </button>
          </div>
        </Transition>
      </div>

      <!-- Notifications -->
      <div class="relative">
        <button @click.stop="toggleNotifications" class="p-2 md:p-2.5 text-white/55 hover:text-white hover:bg-white/5 rounded-full relative">
          <BIcon name="Bell" class="h-5 w-5" />
          <span v-if="unreadCount > 0" class="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-brand-error rounded-full text-[10px] font-bold text-white border-2 border-brand-bg">
            {{ unreadCount > 9 ? '9+' : unreadCount }}
          </span>
        </button>
        <Transition name="filter-expand">
          <div v-if="showNotifications" @click.stop
            class="fixed inset-x-3 top-14 sm:inset-x-auto sm:absolute sm:right-0 sm:top-12 z-50 sm:w-[400px] bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] sm:max-h-[540px]">

            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-3.5 border-b border-brand-border flex-shrink-0">
              <span class="font-bold text-base">Уведомления</span>
              <button v-if="unreadCount > 0" @click="markAllRead"
                class="text-xs text-brand-accent hover:text-white font-semibold transition-colors">
                Прочитать всё
              </button>
            </div>

            <!-- Scrollable list -->
            <div class="overflow-y-auto flex-1">
              <!-- Empty -->
              <div v-if="notifications.length === 0" class="py-12 text-center flex flex-col items-center gap-2">
                <BIcon name="BellOff" class="w-10 h-10 text-white/20" />
                <span class="text-white/40 text-sm">Нет уведомлений</span>
              </div>

              <template v-else>
                <!-- НОВЫЕ -->
                <template v-if="notifications.filter(n => !n.is_read).length > 0">
                  <div class="px-5 pt-3 pb-1.5">
                    <span class="text-[10px] font-bold tracking-widest text-white/35 uppercase">Новые</span>
                  </div>
                  <div v-for="n in notifications.filter(n => !n.is_read)" :key="n.id"
                    class="flex items-start gap-3 px-4 py-3 mx-2 mb-0.5 rounded-2xl cursor-pointer transition-colors"
                    :class="n.type === 'automod_warn' ? 'bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30' : 'bg-brand-accent/5 hover:bg-brand-accent/10'"
                    @click="onNotifClick(n)">
                    <!-- Avatar + type badge -->
                    <div v-if="isAutomodNotif(n)" class="relative flex-shrink-0 mt-0.5">
                      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center">
                        <span class="text-white font-black text-sm select-none" style="letter-spacing:-1px">B</span>
                      </div>
                      <div :class="['absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-brand-card flex items-center justify-center', notifBadgeClass(n.type)]">
                        <BIcon :name="notifBadgeIcon(n.type)" class="w-2.5 h-2.5" />
                      </div>
                    </div>
                    <router-link v-else :to="identityHref(n)" @click.stop="showNotifications = false" class="relative flex-shrink-0 mt-0.5 cursor-pointer">
                      <img :src="identityAvatar(n) || '/icons/badges/NN.jpg'"
                        class="w-10 h-10 rounded-full object-cover border border-brand-border"
                        @error="onAvatarError" />
                      <!-- Type icon badge -->
                      <div :class="['absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-brand-card flex items-center justify-center', notifBadgeClass(n.type)]">
                        <BIcon :name="notifBadgeIcon(n.type)" class="w-2.5 h-2.5" />
                      </div>
                    </router-link>
                    <!-- Text -->
                    <div class="min-w-0 flex-1">
                      <p v-if="isAutomodNotif(n)" class="text-sm text-white leading-snug font-semibold">
                        {{ automodMessage(n) }}
                      </p>
                      <p v-else class="text-sm text-white leading-snug">
                        <router-link :to="identityHref(n)" @click.stop="showNotifications = false" class="font-semibold cursor-pointer hover:underline">{{ identityName(n) }}</router-link>
                        {{ ' ' }}{{ notifTypeLabel(n.type, n.sender?.pronouns) }}
                      </p>
                      <p class="text-xs text-white/40 mt-0.5">{{ formatDate(n.created_at) }}</p>
                      <!-- Relationship request -->
                      <div v-if="n.type === 'RELATIONSHIP_REQUEST' && !n._relDone" class="flex gap-2 mt-2">
                        <button @click.stop="acceptRelationship(n)" :disabled="relActionLoading[n.id]"
                          class="flex-1 py-1 rounded-lg bg-pink-500 hover:bg-pink-400 disabled:opacity-50 text-white text-xs font-bold transition-colors">
                          Принять
                        </button>
                        <button @click.stop="declineRelationship(n)" :disabled="relActionLoading[n.id]"
                          class="flex-1 py-1 rounded-lg bg-brand-bg border border-brand-border hover:border-white/20 disabled:opacity-50 text-white/55 hover:text-white text-xs font-semibold transition-colors">
                          Отклонить
                        </button>
                      </div>
                      <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'accepted'" class="text-xs text-pink-400 mt-1 font-semibold">❤️ Принято</p>
                      <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'declined'" class="text-xs text-white/40 mt-1">Отклонено</p>
                    </div>
                    <!-- Unread dot -->
                    <div class="w-2 h-2 bg-brand-accent rounded-full flex-shrink-0 mt-2"></div>
                  </div>
                </template>

                <!-- ПРОСМОТРЕННЫЕ -->
                <template v-if="notifications.filter(n => n.is_read).length > 0">
                  <div class="px-5 pt-3 pb-1.5">
                    <span class="text-[10px] font-bold tracking-widest text-white/35 uppercase">Просмотренные</span>
                  </div>
                  <div v-for="n in notifications.filter(n => n.is_read)" :key="n.id"
                    class="flex items-start gap-3 px-4 py-3 mx-2 mb-0.5 rounded-2xl cursor-pointer transition-colors"
                    :class="n.type === 'automod_warn' ? 'bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20' : 'hover:bg-white/5'"
                    @click="onNotifClick(n)">
                    <!-- Avatar + type badge -->
                    <div v-if="isAutomodNotif(n)" class="relative flex-shrink-0 mt-0.5 opacity-70">
                      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center">
                        <span class="text-white font-black text-sm select-none" style="letter-spacing:-1px">B</span>
                      </div>
                      <div :class="['absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-brand-card flex items-center justify-center opacity-60', notifBadgeClass(n.type)]">
                        <BIcon :name="notifBadgeIcon(n.type)" class="w-2.5 h-2.5" />
                      </div>
                    </div>
                    <router-link v-else :to="identityHref(n)" @click.stop="showNotifications = false" class="relative flex-shrink-0 mt-0.5 cursor-pointer">
                      <img :src="identityAvatar(n) || '/icons/badges/NN.jpg'"
                        class="w-10 h-10 rounded-full object-cover border border-brand-border opacity-70"
                        @error="onAvatarError" />
                      <div :class="['absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-brand-card flex items-center justify-center opacity-60', notifBadgeClass(n.type)]">
                        <BIcon :name="notifBadgeIcon(n.type)" class="w-2.5 h-2.5" />
                      </div>
                    </router-link>
                    <!-- Text -->
                    <div class="min-w-0 flex-1">
                      <p v-if="isAutomodNotif(n)" class="text-sm text-white/65 leading-snug font-semibold">
                        {{ automodMessage(n) }}
                      </p>
                      <p v-else class="text-sm text-white/65 leading-snug">
                        <router-link :to="identityHref(n)" @click.stop="showNotifications = false" class="font-semibold text-white/80 cursor-pointer hover:underline">{{ identityName(n) }}</router-link>
                        {{ ' ' }}{{ notifTypeLabel(n.type, n.sender?.pronouns) }}
                      </p>
                      <p class="text-xs text-white/30 mt-0.5">{{ formatDate(n.created_at) }}</p>
                      <!-- Relationship request -->
                      <div v-if="n.type === 'RELATIONSHIP_REQUEST' && !n._relDone" class="flex gap-2 mt-2">
                        <button @click.stop="acceptRelationship(n)" :disabled="relActionLoading[n.id]"
                          class="flex-1 py-1 rounded-lg bg-pink-500 hover:bg-pink-400 disabled:opacity-50 text-white text-xs font-bold transition-colors">
                          Принять
                        </button>
                        <button @click.stop="declineRelationship(n)" :disabled="relActionLoading[n.id]"
                          class="flex-1 py-1 rounded-lg bg-brand-bg border border-brand-border hover:border-white/20 disabled:opacity-50 text-white/55 hover:text-white text-xs font-semibold transition-colors">
                          Отклонить
                        </button>
                      </div>
                      <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'accepted'" class="text-xs text-pink-400 mt-1 font-semibold">❤️ Принято</p>
                      <p v-if="n.type === 'RELATIONSHIP_REQUEST' && n._relDone === 'declined'" class="text-xs text-white/40 mt-1">Отклонено</p>
                    </div>
                  </div>
                </template>
              </template>
            </div>

            <!-- Footer -->
            <div class="border-t border-brand-border flex-shrink-0 px-4 py-2.5">
              <router-link to="/notifications" @click="showNotifications = false"
                class="w-full py-2 rounded-xl text-sm text-white/55 hover:text-white hover:bg-white/5
                       font-medium transition-colors flex items-center justify-center gap-1.5">
                <BIcon name="List" class="w-4 h-4" />
                Все уведомления
              </router-link>
            </div>
          </div>
        </Transition>
      </div>

      <!-- NSFW toggle (18+ only) -->
      <button v-if="canUseNsfw" @click="toggleNsfw"
        class="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-full border transition-all duration-200"
        :class="nsfwEnabled ? 'bg-brand-error/15 border-brand-error/40 text-brand-error shadow-sm shadow-brand-error/20' : 'bg-brand-card border-brand-border text-white/55 hover:text-white'">
        <BIcon :name="nsfwEnabled ? 'Eye' : 'EyeOff'" class="h-4 w-4" />
        <span class="text-xs font-bold hidden sm:block">NSFW</span>
        <div class="relative w-7 h-3.5 flex-shrink-0 hidden sm:block">
          <div class="w-7 h-3.5 rounded-full transition-colors" :class="nsfwEnabled ? 'bg-rose-500' : 'bg-white/20'"></div>
          <div class="absolute top-0.5 h-2.5 w-2.5 bg-white rounded-full shadow transition-all" :class="nsfwEnabled ? 'left-[calc(100%-11px)]' : 'left-0.5'"></div>
        </div>
      </button>

      <!-- Logout -->
      <button @click="handleLogout" class="hidden md:flex p-2.5 text-white/55 hover:text-rose-400 hover:bg-rose-500/10 rounded-full">
        <BIcon name="LogOut" class="h-5 w-5" />
      </button>
    </div>
  </header>

  <!-- ═══════════════════════════════════════════════════════════════
       POST MODAL (from notification click)
  ═══════════════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="postModal" class="fixed inset-0 z-[200] overflow-y-auto"
        @click.self="closePostModal">
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-black/70 backdrop-blur-sm" @click="closePostModal" />

        <!-- Centering wrapper -->
        <div class="flex items-center justify-center min-h-full py-8 px-4">
        <!-- Content -->
        <div class="relative w-full max-w-2xl z-10">
          <!-- Close button -->
          <button
            @click="closePostModal"
            class="absolute -top-3 -right-3 z-20 w-9 h-9 bg-brand-card border border-brand-border
                   rounded-full flex items-center justify-center text-white/55 hover:text-white
                   hover:bg-white/10 transition-colors shadow-lg"
          >
            <BIcon name="X" class="w-4 h-4" />
          </button>

          <!-- Loading skeleton -->
          <div v-if="postModal.loading" class="bg-brand-card border border-brand-border rounded-3xl p-6 animate-pulse">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-11 h-11 rounded-full bg-brand-border"></div>
              <div class="flex-1 space-y-2">
                <div class="h-3 bg-brand-border rounded w-32"></div>
                <div class="h-2 bg-brand-border rounded w-20"></div>
              </div>
            </div>
            <div class="space-y-2">
              <div class="h-3 bg-brand-border rounded w-full"></div>
              <div class="h-3 bg-brand-border rounded w-4/5"></div>
              <div class="h-3 bg-brand-border rounded w-2/3"></div>
            </div>
          </div>

          <!-- Post + Comments -->
          <template v-else-if="postModal.data">
            <PostCard :post="postModal.data" />
            <div class="mt-3">
              <PostComments :post-id="postModal.id" />
            </div>
          </template>

          <!-- Error -->
          <div v-else class="bg-brand-card border border-brand-border rounded-3xl p-8 text-center">
            <BIcon name="AlertCircle" class="w-10 h-10 text-white/20 mx-auto mb-2" />
            <p class="text-white/40 text-sm">Не удалось загрузить публикацию</p>
          </div>
        </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ═══════════════════════════════════════════════════════════════
       STORY VIEWER
  ═══════════════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div v-if="activeStory" class="fixed inset-0 z-[600] bg-black/95 flex items-center justify-center" @click.self="closeStory">
        <!-- Progress bar -->
        <div class="absolute top-4 left-1/2 -translate-x-1/2 w-64 h-1 bg-white/20 rounded-full overflow-hidden">
          <div class="h-full bg-brand-accent rounded-full transition-all duration-100" :style="{ width: storyProgress + '%' }" />
        </div>
        <!-- User info -->
        <div class="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-3 cursor-pointer"
          @click="closeStory(); closeSearchModal(); router.push('/profile/' + activeStory.user.username)">
          <img v-if="activeStory.user.avatar_url" :src="activeStory.user.avatar_url" class="w-9 h-9 rounded-full border-2 border-white/20 object-cover" @error="onAvatarError" />
          <div v-else class="w-9 h-9 rounded-full border-2 border-white/20 bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-sm">{{ (activeStory.user.username ?? '?')[0].toUpperCase() }}</div>
          <span class="text-white font-semibold text-sm">{{ activeStory.user.display_name || activeStory.user.username }}</span>
        </div>
        <!-- Story image -->
        <img :src="activeStory.image_url" class="max-w-[90vw] max-h-[80vh] object-contain rounded-2xl shadow-2xl" />
        <!-- Close -->
        <button @click="closeStory" class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <BIcon name="X" class="w-5 h-5" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>
