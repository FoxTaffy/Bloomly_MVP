<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'
import BIcon from '../components/BIcon.vue'

const router = useRouter()
const auth = useAuthStore()

// Guard: only admin/moderator
onMounted(async () => {
  await auth.fetchMe()
  const role = (auth.user as any)?.role
  if (!role || !['admin', 'moderator'].includes(role)) {
    router.replace({ name: 'home' })
  } else {
    fetchStats()
  }
})

// ── Tabs ──────────────────────────────────────────────────────────────
const activeTab = ref<'overview' | 'users' | 'posts' | 'reports' | 'ads'>('overview')

// ── Stats ─────────────────────────────────────────────────────────────
const stats = ref<any>(null)
const isLoadingStats = ref(false)
const fetchStats = async () => {
  isLoadingStats.value = true
  try {
    const res = await api.get('/admin/stats')
    if (res.data.success) stats.value = res.data.data
  } catch {} finally { isLoadingStats.value = false }
}

// ── Users ─────────────────────────────────────────────────────────────
const users = ref<any[]>([])
const userPage = ref(1)
const userTotal = ref(0)
const userSearch = ref('')
const isLoadingUsers = ref(false)
let userSearchDebounce: ReturnType<typeof setTimeout>

const fetchUsers = async () => {
  isLoadingUsers.value = true
  try {
    const res = await api.get('/admin/users', { params: { page: userPage.value, search: userSearch.value || undefined } })
    if (res.data.success) { users.value = res.data.data.users; userTotal.value = res.data.data.total }
  } catch {} finally { isLoadingUsers.value = false }
}

const onUserSearch = () => {
  clearTimeout(userSearchDebounce)
  userSearchDebounce = setTimeout(() => { userPage.value = 1; fetchUsers() }, 300)
}

const updateUserRole = async (userId: string, role: string) => {
  try {
    await api.patch(`/admin/users/${userId}/role`, { role })
    const u = users.value.find(u => u.id === userId)
    if (u) u.role = role
  } catch {}
}

const deleteUser = async (userId: string) => {
  if (!confirm('Удалить пользователя?')) return
  try {
    await api.delete(`/admin/users/${userId}`)
    users.value = users.value.filter(u => u.id !== userId)
  } catch {}
}

// ── Posts ─────────────────────────────────────────────────────────────
const posts = ref<any[]>([])
const postPage = ref(1)
const postTotal = ref(0)
const postSearch = ref('')
const isLoadingPosts = ref(false)
let postSearchDebounce: ReturnType<typeof setTimeout>

const fetchPosts = async () => {
  isLoadingPosts.value = true
  try {
    const res = await api.get('/admin/posts', { params: { page: postPage.value, search: postSearch.value || undefined } })
    if (res.data.success) { posts.value = res.data.data.posts; postTotal.value = res.data.data.total }
  } catch {} finally { isLoadingPosts.value = false }
}

const onPostSearch = () => {
  clearTimeout(postSearchDebounce)
  postSearchDebounce = setTimeout(() => { postPage.value = 1; fetchPosts() }, 300)
}

const deletePost = async (postId: string) => {
  if (!confirm('Удалить пост?')) return
  try {
    await api.delete(`/admin/posts/${postId}`)
    posts.value = posts.value.filter(p => p.id !== postId)
  } catch {}
}

// ── Reports ────────────────────────────────────────────────────────────
const reports = ref<any[]>([])
const reportFilter = ref<'pending' | 'resolved' | 'dismissed' | ''>('')
const isLoadingReports = ref(false)

const fetchReports = async () => {
  isLoadingReports.value = true
  try {
    const res = await api.get('/admin/reports', { params: { status: reportFilter.value || undefined } })
    if (res.data.success) reports.value = res.data.data.reports
  } catch {} finally { isLoadingReports.value = false }
}

const resolveReport = async (reportId: string, status: 'resolved' | 'dismissed') => {
  try {
    await api.patch(`/admin/reports/${reportId}`, { status })
    const r = reports.value.find(r => r.id === reportId)
    if (r) r.status = status
  } catch {}
}

// ── Ads ────────────────────────────────────────────────────────────────
const ads = ref<any[]>([])
const isLoadingAds = ref(false)
const newAd = ref({ title: '', description: '', linkUrl: '', imageUrl: '' })
const showAdForm = ref(false)
const isSubmittingAd = ref(false)

const fetchAds = async () => {
  isLoadingAds.value = true
  try {
    const res = await api.get('/admin/ads')
    if (res.data.success) ads.value = res.data.data.ads
  } catch {} finally { isLoadingAds.value = false }
}

const submitAd = async () => {
  if (!newAd.value.title || !newAd.value.linkUrl) return
  isSubmittingAd.value = true
  try {
    const res = await api.post('/admin/ads', {
      title: newAd.value.title,
      description: newAd.value.description || undefined,
      linkUrl: newAd.value.linkUrl,
      imageUrl: newAd.value.imageUrl || undefined,
    })
    if (res.data.success) {
      ads.value.unshift(res.data.data.ad)
      newAd.value = { title: '', description: '', linkUrl: '', imageUrl: '' }
      showAdForm.value = false
    }
  } catch {} finally { isSubmittingAd.value = false }
}

const reviewAd = async (adId: string, status: 'active' | 'rejected') => {
  try {
    const body: any = { status }
    if (status === 'active') {
      body.startsAt = new Date().toISOString()
      body.endsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
    await api.patch(`/admin/ads/${adId}/review`, body)
    const a = ads.value.find(a => a.id === adId)
    if (a) a.status = status
  } catch {}
}

// Tab switch data loading
const switchTab = (tab: typeof activeTab.value) => {
  activeTab.value = tab
  if (tab === 'users' && !users.value.length) fetchUsers()
  if (tab === 'posts' && !posts.value.length) fetchPosts()
  if (tab === 'reports' && !reports.value.length) fetchReports()
  if (tab === 'ads' && !ads.value.length) fetchAds()
}

const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })

// Chart max for history
const histMax = computed(() => Math.max(...(stats.value?.postsHistory ?? []).map((h: any) => h.count), 1))
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito p-4 md:p-8">
    <div class="max-w-6xl mx-auto">

      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-black flex items-center gap-3">
            <div class="w-10 h-10 rounded-2xl bg-gradient-to-br bg-brand-accent flex items-center justify-center shadow-lg shadow-brand-accent/30">
              <BIcon name="Shield" class="w-5 h-5 text-white" />
            </div>
            Панель управления
          </h1>
          <p class="text-sm text-brand-muted mt-1">Bloomly Admin</p>
        </div>
        <button @click="router.push({ name: 'home' })"
          class="flex items-center gap-2 px-4 py-2 rounded-2xl bg-brand-bg text-brand-muted hover:text-white hover:bg-brand-border text-sm font-semibold border border-brand-border transition-all">
          <BIcon name="ArrowLeft" class="w-4 h-4" /> На главную
        </button>
      </div>

      <!-- Tab Nav -->
      <div class="flex flex-wrap gap-2 mb-6">
        <button v-for="tab in (['overview', 'users', 'posts', 'reports', 'ads'] as const)" :key="tab"
          @click="switchTab(tab)"
          :class="activeTab === tab ? 'bg-gradient-to-r bg-brand-accent text-white shadow-sm shadow-brand-accent/25' : 'bg-brand-bg text-brand-muted hover:text-white border border-brand-border'"
          class="px-5 py-2.5 rounded-2xl text-sm font-bold transition-all capitalize">
          {{ { overview: 'Обзор', users: 'Пользователи', posts: 'Посты', reports: 'Жалобы', ads: 'Реклама' }[tab] }}
        </button>
      </div>

      <!-- ── OVERVIEW ─────────────────────────────────────────────────── -->
      <div v-if="activeTab === 'overview'">
        <div v-if="isLoadingStats" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div v-for="n in 4" :key="n" class="bg-brand-card border border-brand-border rounded-3xl p-5 animate-pulse h-28"></div>
        </div>
        <template v-else-if="stats">
          <!-- Stat cards -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl">
              <p class="text-xs text-brand-muted font-semibold mb-2 flex items-center gap-1.5"><BIcon name="Users" class="w-3.5 h-3.5" />Пользователи</p>
              <p class="text-3xl font-black text-white">{{ formatNum(stats.users.total) }}</p>
              <p class="text-xs text-brand-success mt-1">+{{ stats.users.today }} сегодня</p>
            </div>
            <div class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl">
              <p class="text-xs text-brand-muted font-semibold mb-2 flex items-center gap-1.5"><BIcon name="MessageSquare" class="w-3.5 h-3.5" />Посты</p>
              <p class="text-3xl font-black text-white">{{ formatNum(stats.posts.total) }}</p>
              <p class="text-xs text-brand-accent mt-1">+{{ stats.posts.today }} сегодня</p>
            </div>
            <div class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl">
              <p class="text-xs text-brand-muted font-semibold mb-2 flex items-center gap-1.5"><BIcon name="Flag" class="w-3.5 h-3.5" />Жалобы</p>
              <p class="text-3xl font-black text-white">{{ formatNum(stats.moderation.pendingReports) }}</p>
              <p class="text-xs text-brand-yellow mt-1">Ожидают рассмотрения</p>
            </div>
            <div class="bg-brand-card border border-brand-border rounded-3xl p-5 shadow-xl">
              <p class="text-xs text-brand-muted font-semibold mb-2 flex items-center gap-1.5"><BIcon name="Megaphone" class="w-3.5 h-3.5" />Реклама</p>
              <p class="text-3xl font-black text-white">{{ formatNum(stats.moderation.pendingAds) }}</p>
              <p class="text-xs text-brand-error mt-1">Ожидают проверки</p>
            </div>
          </div>

          <!-- Posts history chart -->
          <div class="bg-brand-card border border-brand-border rounded-3xl p-6 shadow-xl mb-6">
            <h3 class="font-bold text-sm mb-5 flex items-center gap-2">
              <BIcon name="BarChart2" class="w-4 h-4 text-brand-accent" /> Активность постов (14 дней)
            </h3>
            <div class="flex items-end gap-1.5 h-24">
              <div v-for="point in stats.postsHistory" :key="point.day"
                class="flex-1 flex flex-col items-center gap-1 group/bar">
                <div class="w-full bg-gradient-to-t bg-brand-accent rounded-t-md transition-all hover:opacity-80"
                  :style="`height: ${Math.max(4, (point.count / histMax) * 96)}px`"
                  :title="`${point.day}: ${point.count} постов`"></div>
                <span class="text-[8px] text-brand-muted hidden group-hover/bar:block absolute -bottom-4">{{ point.count }}</span>
              </div>
            </div>
            <div class="flex justify-between mt-2">
              <span class="text-[10px] text-brand-muted">{{ stats.postsHistory[0]?.day?.slice(5) }}</span>
              <span class="text-[10px] text-brand-muted">{{ stats.postsHistory[stats.postsHistory.length - 1]?.day?.slice(5) }}</span>
            </div>
          </div>

          <!-- Role breakdown -->
          <div class="bg-brand-card border border-brand-border rounded-3xl p-6 shadow-xl">
            <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><BIcon name="PieChart" class="w-4 h-4 text-brand-purple" />Роли пользователей</h3>
            <div class="flex flex-wrap gap-3">
              <div v-for="rb in stats.roleBreakdown" :key="rb.role"
                class="flex items-center gap-2 px-4 py-2 bg-brand-bg border border-brand-border rounded-2xl">
                <span class="text-sm font-bold text-white">{{ rb.count }}</span>
                <span class="text-xs text-brand-muted capitalize">{{ rb.role }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- ── USERS ──────────────────────────────────────────────────────── -->
      <div v-else-if="activeTab === 'users'">
        <div class="flex items-center gap-3 mb-4">
          <div class="relative flex-1 max-w-xs">
            <BIcon name="Search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
            <input v-model="userSearch" @input="onUserSearch" type="text" placeholder="Поиск пользователей..."
              class="w-full bg-brand-bg border border-brand-border rounded-2xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent" />
          </div>
          <span class="text-xs text-brand-muted">{{ userTotal }} всего</span>
        </div>

        <div v-if="isLoadingUsers" class="space-y-3">
          <div v-for="n in 5" :key="n" class="bg-brand-card border border-brand-border rounded-2xl p-4 animate-pulse h-16"></div>
        </div>
        <div v-else class="space-y-2">
          <div v-for="user in users" :key="user.id"
            class="bg-brand-card border border-brand-border rounded-2xl px-4 py-3 flex items-center gap-3 hover:border-brand-accent/30 transition-all">
            <img :src="user.avatar_url || `https://ui-avatars.com/api/?name=${user.username}&background=random`"
              class="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-brand-border" />
            <div class="flex-1 min-w-0">
              <p class="font-bold text-sm text-white truncate">{{ user.display_name || user.username }}</p>
              <p class="text-xs text-brand-muted">@{{ user.username }} · {{ user._count?.posts ?? 0 }} постов · {{ formatDate(user.created_at) }}</p>
            </div>
            <div class="flex items-center gap-2 flex-shrink-0">
              <select :value="user.role" @change="updateUserRole(user.id, ($event.target as HTMLSelectElement).value)"
                class="bg-brand-bg border border-brand-border rounded-xl px-2 py-1.5 text-xs text-white outline-none focus:border-brand-accent">
                <option value="user">user</option>
                <option value="moderator">moderator</option>
                <option value="admin">admin</option>
              </select>
              <button @click="deleteUser(user.id)"
                class="p-1.5 text-brand-muted hover:text-brand-error hover:bg-rose-500/10 rounded-xl transition-colors">
                <BIcon name="Trash2" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="userTotal > 20" class="flex justify-center gap-2 mt-4">
          <button @click="userPage--; fetchUsers()" :disabled="userPage <= 1"
            class="p-2 rounded-xl bg-brand-bg text-brand-muted hover:text-white disabled:opacity-30 border border-brand-border">
            <BIcon name="ChevronLeft" class="w-4 h-4" />
          </button>
          <span class="px-4 py-2 text-sm text-brand-muted">{{ userPage }} / {{ Math.ceil(userTotal / 20) }}</span>
          <button @click="userPage++; fetchUsers()" :disabled="userPage >= Math.ceil(userTotal / 20)"
            class="p-2 rounded-xl bg-brand-bg text-brand-muted hover:text-white disabled:opacity-30 border border-brand-border">
            <BIcon name="ChevronRight" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- ── POSTS ──────────────────────────────────────────────────────── -->
      <div v-else-if="activeTab === 'posts'">
        <div class="flex items-center gap-3 mb-4">
          <div class="relative flex-1 max-w-xs">
            <BIcon name="Search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
            <input v-model="postSearch" @input="onPostSearch" type="text" placeholder="Поиск постов..."
              class="w-full bg-brand-bg border border-brand-border rounded-2xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent" />
          </div>
          <span class="text-xs text-brand-muted">{{ postTotal }} всего</span>
        </div>

        <div v-if="isLoadingPosts" class="space-y-3">
          <div v-for="n in 5" :key="n" class="bg-brand-card border border-brand-border rounded-2xl p-4 animate-pulse h-20"></div>
        </div>
        <div v-else class="space-y-2">
          <div v-for="post in posts" :key="post.id"
            class="bg-brand-card border border-brand-border rounded-2xl px-4 py-3 flex items-start gap-3 hover:border-brand-accent/30 transition-all">
            <img :src="post.author?.avatar_url || `https://ui-avatars.com/api/?name=${post.author?.username}&background=random`"
              class="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-brand-border mt-0.5" />
            <div class="flex-1 min-w-0">
              <p class="text-xs text-brand-muted mb-0.5">@{{ post.author?.username }} · {{ formatDate(post.created_at) }}</p>
              <p class="text-sm text-white line-clamp-2">{{ post.content }}</p>
              <div class="flex items-center gap-3 mt-1.5 text-[10px] text-brand-muted">
                <span>{{ post._count?.votes ?? 0 }} голосов</span>
                <span>{{ post._count?.comments ?? 0 }} комм.</span>
                <span v-if="post.is_nsfw" class="text-brand-error font-bold">NSFW</span>
              </div>
            </div>
            <button @click="deletePost(post.id)"
              class="p-1.5 text-brand-muted hover:text-brand-error hover:bg-rose-500/10 rounded-xl transition-colors flex-shrink-0">
              <BIcon name="Trash2" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div v-if="postTotal > 20" class="flex justify-center gap-2 mt-4">
          <button @click="postPage--; fetchPosts()" :disabled="postPage <= 1"
            class="p-2 rounded-xl bg-brand-bg text-brand-muted hover:text-white disabled:opacity-30 border border-brand-border">
            <BIcon name="ChevronLeft" class="w-4 h-4" />
          </button>
          <span class="px-4 py-2 text-sm text-brand-muted">{{ postPage }} / {{ Math.ceil(postTotal / 20) }}</span>
          <button @click="postPage++; fetchPosts()" :disabled="postPage >= Math.ceil(postTotal / 20)"
            class="p-2 rounded-xl bg-brand-bg text-brand-muted hover:text-white disabled:opacity-30 border border-brand-border">
            <BIcon name="ChevronRight" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- ── REPORTS ─────────────────────────────────────────────────────── -->
      <div v-else-if="activeTab === 'reports'">
        <div class="flex items-center gap-2 mb-4">
          <button v-for="s in (['', 'pending', 'resolved', 'dismissed'] as const)" :key="s"
            @click="reportFilter = s; fetchReports()"
            :class="reportFilter === s ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' : 'bg-brand-bg border-brand-border text-brand-muted hover:text-white'"
            class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all">
            {{ { '': 'Все', pending: 'Ожид.', resolved: 'Решено', dismissed: 'Откл.' }[s] }}
          </button>
        </div>

        <div v-if="isLoadingReports" class="space-y-3">
          <div v-for="n in 4" :key="n" class="bg-brand-card border border-brand-border rounded-2xl p-4 animate-pulse h-20"></div>
        </div>
        <div v-else-if="reports.length === 0" class="text-center py-12 text-brand-muted">Жалоб нет</div>
        <div v-else class="space-y-2">
          <div v-for="report in reports" :key="report.id"
            class="bg-brand-card border border-brand-border rounded-2xl px-4 py-3 flex items-start gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-bold px-2 py-0.5 rounded-full border capitalize"
                  :class="report.status === 'pending' ? 'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/20' : report.status === 'resolved' ? 'text-brand-success bg-brand-success/10 border-brand-success/20' : 'text-brand-muted bg-brand-bg border-brand-border'">
                  {{ report.status }}
                </span>
                <span class="text-xs text-brand-muted">{{ report.target_type }} · {{ formatDate(report.created_at) }}</span>
              </div>
              <p class="text-sm text-white">{{ report.reason }}</p>
              <p class="text-xs text-brand-muted mt-0.5">от @{{ report.reporter?.username }}</p>
            </div>
            <div v-if="report.status === 'pending'" class="flex gap-2 flex-shrink-0">
              <button @click="resolveReport(report.id, 'resolved')"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-brand-success border border-emerald-500/25 hover:bg-emerald-500/25 transition-colors">
                Решено
              </button>
              <button @click="resolveReport(report.id, 'dismissed')"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-brand-bg text-brand-muted border border-brand-border hover:text-white transition-colors">
                Откл.
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ── ADS ────────────────────────────────────────────────────────── -->
      <div v-else-if="activeTab === 'ads'">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-sm">Рекламные объявления</h3>
          <button @click="showAdForm = !showAdForm"
            class="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold bg-gradient-to-r bg-brand-accent text-white shadow-sm shadow-brand-accent/25">
            <BIcon name="Plus" class="w-3.5 h-3.5" /> Создать объявление
          </button>
        </div>

        <!-- Ad creation form -->
        <Transition name="filter-expand">
          <div v-if="showAdForm" class="bg-brand-card border border-brand-accent/30 rounded-3xl p-5 mb-4 space-y-3">
            <h4 class="font-bold text-sm text-brand-accent">Новое объявление</h4>
            <input v-model="newAd.title" type="text" placeholder="Заголовок *"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent" />
            <textarea v-model="newAd.description" placeholder="Описание"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent resize-none h-20"></textarea>
            <input v-model="newAd.linkUrl" type="url" placeholder="Ссылка *"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent" />
            <input v-model="newAd.imageUrl" type="url" placeholder="URL изображения (опционально)"
              class="w-full bg-brand-bg border border-brand-border rounded-2xl px-4 py-2.5 text-sm text-white placeholder-brand-muted outline-none focus:border-brand-accent" />
            <div class="flex gap-2 justify-end">
              <button @click="showAdForm = false" class="px-4 py-2 rounded-xl text-sm text-brand-muted hover:text-white hover:bg-brand-bg border border-brand-border">Отмена</button>
              <button @click="submitAd" :disabled="isSubmittingAd || !newAd.title || !newAd.linkUrl"
                class="px-4 py-2 rounded-xl text-sm font-bold bg-brand-accent text-white hover:bg-[#5b74d8] disabled:opacity-40">
                {{ isSubmittingAd ? 'Создание...' : 'Создать' }}
              </button>
            </div>
          </div>
        </Transition>

        <div v-if="isLoadingAds" class="space-y-3">
          <div v-for="n in 3" :key="n" class="bg-brand-card border border-brand-border rounded-2xl p-4 animate-pulse h-24"></div>
        </div>
        <div v-else-if="ads.length === 0" class="text-center py-12 text-brand-muted">Объявлений нет</div>
        <div v-else class="space-y-3">
          <div v-for="ad in ads" :key="ad.id"
            class="bg-brand-card border border-brand-border rounded-2xl p-4 flex items-start gap-4 hover:border-brand-accent/30 transition-all">
            <img v-if="ad.image_url" :src="ad.image_url" class="w-16 h-16 rounded-xl object-cover border border-brand-border flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-xs font-bold px-2 py-0.5 rounded-full border"
                  :class="ad.status === 'active' ? 'text-brand-success bg-brand-success/10 border-brand-success/20' : ad.status === 'pending' ? 'text-brand-yellow bg-brand-yellow/10 border-brand-yellow/20' : 'text-brand-muted bg-brand-bg border-brand-border'">
                  {{ ad.status }}
                </span>
                <span class="text-xs text-brand-muted">{{ ad.impressions ?? 0 }} показов · {{ ad.clicks ?? 0 }} кликов</span>
              </div>
              <p class="font-bold text-sm text-white">{{ ad.title }}</p>
              <p v-if="ad.description" class="text-xs text-brand-muted mt-0.5 line-clamp-1">{{ ad.description }}</p>
              <a :href="ad.link_url" target="_blank" class="text-xs text-brand-accent hover:underline mt-0.5 block truncate">{{ ad.link_url }}</a>
            </div>
            <div v-if="ad.status === 'pending'" class="flex flex-col gap-2 flex-shrink-0">
              <button @click="reviewAd(ad.id, 'active')"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/15 text-brand-success border border-emerald-500/25 hover:bg-emerald-500/25 transition-colors">
                Одобрить
              </button>
              <button @click="reviewAd(ad.id, 'rejected')"
                class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-brand-error border border-rose-500/20 hover:bg-rose-500/20 transition-colors">
                Отклонить
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.filter-expand-enter-active, .filter-expand-leave-active {
  transition: all 0.2s ease;
}
.filter-expand-enter-from, .filter-expand-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
