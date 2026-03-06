<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'
import BIcon from '../components/BIcon.vue'
import MediaUpload from '../components/MediaUpload.vue'

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
const activeTab = ref<'overview' | 'users' | 'archived' | 'posts' | 'reports' | 'ads' | 'verification' | 'banners' | 'automod'>('overview')

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

// ── Archived Users ────────────────────────────────────────────────────
const archivedUsers = ref<any[]>([])
const archivedPage = ref(1)
const archivedTotal = ref(0)
const archivedSearch = ref('')
const isLoadingArchived = ref(false)
let archivedSearchDebounce: ReturnType<typeof setTimeout>

const fetchArchivedUsers = async () => {
  isLoadingArchived.value = true
  try {
    const res = await api.get('/admin/users/archived', { params: { page: archivedPage.value, search: archivedSearch.value || undefined } })
    if (res.data.success) { archivedUsers.value = res.data.data.users; archivedTotal.value = res.data.data.total }
  } catch {} finally { isLoadingArchived.value = false }
}

const onArchivedSearch = () => {
  clearTimeout(archivedSearchDebounce)
  archivedSearchDebounce = setTimeout(() => { archivedPage.value = 1; fetchArchivedUsers() }, 300)
}

const restoreUser = async (userId: string) => {
  if (!confirm('Восстановить пользователя?')) return
  try {
    await api.post(`/admin/users/${userId}/restore`)
    archivedUsers.value = archivedUsers.value.filter(u => u.id !== userId)
    archivedTotal.value = Math.max(0, archivedTotal.value - 1)
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

// ── Verification ──────────────────────────────────────────────────────
const verRequests = ref<any[]>([])
const verFilter = ref('')
const isLoadingVer = ref(false)

const fetchVerRequests = async () => {
  isLoadingVer.value = true
  try {
    const params: any = { page: 1 }
    if (verFilter.value) params.status = verFilter.value
    const res = await api.get('/verification/admin/requests', { params })
    if (res.data.success) verRequests.value = res.data.data.requests
  } catch {} finally { isLoadingVer.value = false }
}

const reviewVerRequest = async (id: string, action: 'approve' | 'reject', reason?: string) => {
  try {
    await api.patch(`/verification/admin/requests/${id}`, { action, reason })
    verRequests.value = verRequests.value.filter(r => r.id !== id)
    // Could also re-fetch: fetchVerRequests()
  } catch {}
}

const expandedEvidence = ref<string | null>(null)
const verTypeLabels: Record<string, string> = { artist: 'Художник', master: 'Мастер', event: 'Мероприятие' }
const verTypeColors: Record<string, string> = {
  artist: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  master: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  event: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
}

// Tab switch data loading
// ── AutoMod ───────────────────────────────────────────────────────────
const autoModLogs = ref<any[]>([])
const autoModTotal = ref(0)
const autoModPage = ref(1)
const autoModPages = ref(1)
const isLoadingAutoMod = ref(false)
const autoModActionFilter = ref('')
const autoModCategoryFilter = ref('')

const fetchAutoModLogs = async () => {
  isLoadingAutoMod.value = true
  try {
    const res = await api.get('/admin/automod/logs', {
      params: { page: autoModPage.value, action: autoModActionFilter.value || undefined, category: autoModCategoryFilter.value || undefined },
    })
    if (res.data.success) {
      autoModLogs.value  = res.data.data.logs
      autoModTotal.value = res.data.data.total
      autoModPages.value = res.data.data.pages
    }
  } catch {} finally { isLoadingAutoMod.value = false }
}

const unfreezeUser = async (userId: string) => {
  try {
    await api.post(`/admin/users/${userId}/unfreeze`)
    const u = users.value.find(u => u.id === userId)
    if (u) { u.frozen_at = null; u.frozen_reason = null }
    await fetchAutoModLogs()
  } catch {}
}

const freezeUser = async (userId: string) => {
  const reason = prompt('Причина заморозки:') ?? ''
  if (!reason.trim()) return
  try {
    await api.post(`/admin/users/${userId}/freeze`, { reason })
    const u = users.value.find(u => u.id === userId)
    if (u) u.frozen_at = new Date().toISOString()
  } catch {}
}

const clearUserWarns = async (userId: string) => {
  try {
    await api.post(`/admin/users/${userId}/clear-warns`)
    const u = users.value.find(u => u.id === userId)
    if (u) u.warn_count = 0
  } catch {}
}

const actionColor = (action: string): string => ({
  warn:       '#f59e0b',
  freeze:     '#0ea5e9',
  unfreeze:   '#10b981',
  ban:        '#ef4444',
  flag_post:  '#f97316',
  clear_warns:'#8b5cf6',
  manual:     '#6366f1',
}[action] ?? '#6b7280')

const categoryEmoji = (cat: string): string => ({
  spam:       '🔁',
  toxic:      '🤬',
  duplicate:  '📋',
  fraud:      '🚨',
  suspicious: '👁️',
  manual:     '🛡️',
  other:      '📌',
}[cat] ?? '📌')

// ── Banners ───────────────────────────────────────────────────────────
const banners = ref<any[]>([])
const isLoadingBanners = ref(false)
const showBannerForm = ref(false)
const editingBannerId = ref<string | null>(null)
const bannerForm = ref({ title: '', subtitle: '', tag_label: '', image_url: '', link_url: '', price_label: '', gradient: '', sort_order: 0, is_active: true })
const bannerError = ref('')

const fetchBanners = async () => {
  isLoadingBanners.value = true
  try {
    const res = await api.get('/admin/sticker-banners')
    if (res.data.success) banners.value = res.data.data
  } catch {} finally { isLoadingBanners.value = false }
}

const openBannerCreate = () => {
  editingBannerId.value = null
  bannerForm.value = { title: '', subtitle: '', tag_label: '', image_url: '', link_url: '', price_label: '', gradient: '', sort_order: banners.value.length, is_active: true }
  bannerError.value = ''
  showBannerForm.value = true
}

const openBannerEdit = (b: any) => {
  editingBannerId.value = b.id
  bannerForm.value = { title: b.title, subtitle: b.subtitle || '', tag_label: b.tag_label || '', image_url: b.image_url, link_url: b.link_url || '', price_label: b.price_label || '', gradient: b.gradient || '', sort_order: b.sort_order, is_active: b.is_active }
  bannerError.value = ''
  showBannerForm.value = true
}

const saveBanner = async () => {
  bannerError.value = ''
  try {
    if (editingBannerId.value) {
      const res = await api.patch(`/admin/sticker-banners/${editingBannerId.value}`, bannerForm.value)
      if (res.data.success) {
        const idx = banners.value.findIndex(b => b.id === editingBannerId.value)
        if (idx !== -1) banners.value[idx] = res.data.data
        showBannerForm.value = false
      }
    } else {
      const res = await api.post('/admin/sticker-banners', bannerForm.value)
      if (res.data.success) {
        banners.value.push(res.data.data)
        showBannerForm.value = false
      }
    }
  } catch (e: any) {
    if (e?.response?.data?.code === 'LIMIT') bannerError.value = 'Достигнут лимит 7 баннеров'
    else bannerError.value = 'Ошибка сохранения'
  }
}

const deleteBanner = async (id: string) => {
  if (!confirm('Удалить баннер?')) return
  try {
    await api.delete(`/admin/sticker-banners/${id}`)
    banners.value = banners.value.filter(b => b.id !== id)
  } catch {}
}

const toggleBannerActive = async (b: any) => {
  try {
    const res = await api.patch(`/admin/sticker-banners/${b.id}`, { is_active: !b.is_active })
    if (res.data.success) {
      const idx = banners.value.findIndex(x => x.id === b.id)
      if (idx !== -1) banners.value[idx] = res.data.data
    }
  } catch {}
}

// Tab switch data loading
const switchTab = (tab: typeof activeTab.value) => {
  activeTab.value = tab
  if (tab === 'users' && !users.value.length) fetchUsers()
  if (tab === 'archived' && !archivedUsers.value.length) fetchArchivedUsers()
  if (tab === 'posts' && !posts.value.length) fetchPosts()
  if (tab === 'reports' && !reports.value.length) fetchReports()
  if (tab === 'ads' && !ads.value.length) fetchAds()
  if (tab === 'verification' && !verRequests.value.length) fetchVerRequests()
  if (tab === 'banners' && !banners.value.length) fetchBanners()
  if (tab === 'automod') fetchAutoModLogs()
}

const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })

// Chart max for history
const histMax = computed(() => Math.max(...(stats.value?.postsHistory ?? []).map((h: any) => h.count), 1))

const navItems = computed(() => [
  { tab: 'overview'     as const, label: 'Обзор',          icon: 'LayoutDashboard', color: '#6366f1', badge: null },
  { tab: 'users'        as const, label: 'Пользователи',   icon: 'Users',           color: '#8b5cf6', badge: userTotal.value > 0 ? formatNum(userTotal.value) : null },
  { tab: 'archived'     as const, label: 'Архив',           icon: 'Archive',         color: '#64748b', badge: archivedTotal.value > 0 ? String(archivedTotal.value) : null },
  { tab: 'posts'        as const, label: 'Посты',           icon: 'FileText',        color: '#0ea5e9', badge: null },
  { tab: 'reports'      as const, label: 'Жалобы',          icon: 'Flag',            color: '#f59e0b', badge: reports.value.filter((r:any) => r.status==='pending').length || null },
  { tab: 'ads'          as const, label: 'Реклама',         icon: 'Megaphone',       color: '#f97316', badge: ads.value.filter((a:any) => a.status==='pending').length || null },
  { tab: 'verification' as const, label: 'Верификация',     icon: 'BadgeCheck',      color: '#06b6d4', badge: verRequests.value.filter((r:any) => r.status==='pending').length || null },
  { tab: 'banners'      as const, label: 'Баннеры',         icon: 'Image',           color: '#a855f7', badge: null },
  { tab: 'automod'      as const, label: 'AutoMod',          icon: 'ShieldAlert',     color: '#ef4444', badge: autoModTotal.value > 0 ? formatNum(autoModTotal.value) : null },
])

const statCards = computed(() => stats.value ? [
  { label: 'Пользователей', icon: 'Users',          color: '#8b5cf6', value: formatNum(stats.value.users.total),            sub: `+${stats.value.users.today} сегодня` },
  { label: 'Постов',        icon: 'FileText',        color: '#6366f1', value: formatNum(stats.value.posts.total),            sub: `+${stats.value.posts.today} сегодня` },
  { label: 'Жалоб',         icon: 'Flag',            color: '#f59e0b', value: formatNum(stats.value.moderation.pendingReports), sub: 'ожидают рассмотрения' },
  { label: 'Реклама',       icon: 'Megaphone',       color: '#f97316', value: formatNum(stats.value.moderation.pendingAds),  sub: 'ожидают проверки' },
] : [])

const roleColor = (role: string) => ({ admin: '#f97316', moderator: '#8b5cf6', user: '#6366f1' }[role] ?? '#6366f1')
</script>

<template>
  <div class="min-h-screen bg-[#0a0a12] text-white font-nunito flex">

    <!-- ═══════════════════ SIDEBAR ═══════════════════════════════════════ -->
    <aside class="w-64 flex-shrink-0 hidden md:flex flex-col fixed top-0 left-0 h-full z-30
      bg-[#0d0d1a] border-r border-white/5">

      <!-- Logo -->
      <div class="px-6 pt-6 pb-5 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-accent/30"
            style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
            <BIcon name="Shield" class="w-5 h-5 text-white" />
          </div>
          <div>
            <p class="font-extrabold text-white text-sm leading-none">Bloomly</p>
            <p class="text-[10px] text-white/40 mt-0.5 font-semibold tracking-widest uppercase">Admin Panel</p>
          </div>
        </div>
      </div>

      <!-- Nav items -->
      <nav class="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <button v-for="item in navItems" :key="item.tab" @click="switchTab(item.tab)"
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-semibold transition-all group relative"
          :class="activeTab === item.tab
            ? 'text-white'
            : 'text-white/45 hover:text-white/75 hover:bg-white/5'">
          <!-- Active bg -->
          <div v-if="activeTab === item.tab"
            class="absolute inset-0 rounded-2xl"
            :style="`background:linear-gradient(135deg,${item.color}22,${item.color}10)`" />
          <div v-if="activeTab === item.tab"
            class="absolute inset-0 rounded-2xl border"
            :style="`border-color:${item.color}25`" />
          <!-- Icon -->
          <div class="relative w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
            :style="activeTab === item.tab ? `background:${item.color}25` : ''"
            :class="activeTab !== item.tab ? 'group-hover:bg-white/5' : ''">
            <BIcon :name="item.icon" class="w-3.5 h-3.5 transition-all"
              :style="activeTab === item.tab ? `color:${item.color}` : ''" />
          </div>
          <span class="relative flex-1 text-left text-[13px]">{{ item.label }}</span>
          <!-- Badge for pending counts -->
          <span v-if="item.badge" class="relative text-[10px] font-extrabold px-1.5 py-0.5 rounded-full"
            :style="`background:${item.color}22;color:${item.color}`">
            {{ item.badge }}
          </span>
        </button>
      </nav>

      <!-- Footer -->
      <div class="p-3 border-t border-white/5">
        <button @click="router.push({ name: 'home' })"
          class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-all">
          <BIcon name="ArrowLeft" class="w-3.5 h-3.5" /> На главную
        </button>
      </div>
    </aside>

    <!-- ═══════════════════ MAIN CONTENT ══════════════════════════════════ -->
    <div class="flex-1 md:ml-64 min-h-screen flex flex-col">

      <!-- Top bar -->
      <header class="sticky top-0 z-20 bg-[#0a0a12]/80 backdrop-blur-xl border-b border-white/5 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 class="font-extrabold text-white text-lg leading-none">{{ navItems.find(i=>i.tab===activeTab)?.label }}</h1>
          <p class="text-xs text-white/35 mt-0.5">Bloomly Admin Panel</p>
        </div>
        <!-- Mobile nav -->
        <div class="flex md:hidden gap-1 overflow-x-auto">
          <button v-for="item in navItems" :key="item.tab" @click="switchTab(item.tab)"
            :style="activeTab === item.tab ? `background:${item.color}20;color:${item.color};border-color:${item.color}30` : ''"
            :class="activeTab !== item.tab ? 'text-white/40 border-white/10' : ''"
            class="w-9 h-9 flex-shrink-0 rounded-xl border flex items-center justify-center transition-all">
            <BIcon :name="item.icon" class="w-4 h-4" />
          </button>
        </div>
        <!-- Online indicator -->
        <div class="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span class="text-xs font-bold text-emerald-400">Online</span>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 p-6 max-w-5xl mx-auto w-full">

        <!-- ── OVERVIEW ─────────────────────────────────────────────── -->
        <div v-if="activeTab === 'overview'">
          <!-- Skeleton -->
          <div v-if="isLoadingStats" class="space-y-5">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div v-for="n in 4" :key="n" class="h-32 rounded-3xl bg-white/5 animate-pulse" />
            </div>
            <div class="h-56 rounded-3xl bg-white/5 animate-pulse" />
          </div>

          <template v-else-if="stats">
            <!-- Stat cards -->
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div v-for="sc in statCards" :key="sc.label"
                class="relative rounded-3xl p-5 overflow-hidden border border-white/5 hover:border-white/10 transition-all group"
                :style="`background:linear-gradient(135deg,${sc.color}18 0%,${sc.color}06 100%)`">
                <div class="absolute -right-3 -top-3 w-20 h-20 rounded-full blur-2xl opacity-20 transition-opacity group-hover:opacity-30"
                  :style="`background:${sc.color}`" />
                <div class="w-9 h-9 rounded-2xl flex items-center justify-center mb-3 relative"
                  :style="`background:${sc.color}20`">
                  <BIcon :name="sc.icon" class="w-4 h-4" :style="`color:${sc.color}`" />
                </div>
                <p class="text-3xl font-black text-white relative">{{ sc.value }}</p>
                <p class="text-xs text-white/45 mt-0.5 font-semibold relative">{{ sc.label }}</p>
                <p class="text-xs font-bold mt-2 relative" :style="`color:${sc.color}`">{{ sc.sub }}</p>
              </div>
            </div>

            <!-- Chart -->
            <div class="rounded-3xl border border-white/5 p-6 mb-5"
              style="background:linear-gradient(135deg,rgba(99,102,241,0.06) 0%,rgba(139,92,246,0.03) 100%)">
              <div class="flex items-center justify-between mb-6">
                <div>
                  <h3 class="font-extrabold text-white text-sm">Активность постов</h3>
                  <p class="text-xs text-white/40 mt-0.5">Последние 14 дней</p>
                </div>
                <span class="text-xs font-bold px-3 py-1.5 rounded-full border"
                  style="background:rgba(99,102,241,0.15);border-color:rgba(99,102,241,0.25);color:#818cf8">
                  {{ stats.posts.total }} всего
                </span>
              </div>
              <div class="flex items-end gap-1.5 h-28">
                <div v-for="(point, idx) in stats.postsHistory" :key="idx"
                  class="flex-1 flex flex-col items-center gap-1 group/bar cursor-default relative">
                  <div class="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100
                    text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-none">
                    {{ point.count }}
                  </div>
                  <div class="w-full rounded-t-lg transition-all hover:opacity-100 opacity-75"
                    :style="`height:${Math.max(4, (point.count / histMax) * 112)}px;
                      background:linear-gradient(to top,#6366f1,#8b5cf6)`" />
                </div>
              </div>
              <div class="flex justify-between mt-2 px-0.5">
                <span class="text-[10px] text-white/30">{{ stats.postsHistory[0]?.day?.slice(5) }}</span>
                <span class="text-[10px] text-white/30">{{ stats.postsHistory[stats.postsHistory.length-1]?.day?.slice(5) }}</span>
              </div>
            </div>

            <!-- Roles -->
            <div class="rounded-3xl border border-white/5 p-6" style="background:rgba(255,255,255,0.02)">
              <h3 class="font-extrabold text-sm text-white mb-4 flex items-center gap-2">
                <BIcon name="Users" class="w-4 h-4 text-white/40" /> Распределение ролей
              </h3>
              <div class="flex flex-wrap gap-3">
                <div v-for="rb in stats.roleBreakdown" :key="rb.role"
                  class="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-white/8"
                  style="background:rgba(255,255,255,0.04)">
                  <div class="w-2 h-2 rounded-full" :style="`background:${roleColor(rb.role)}`" />
                  <span class="text-sm font-black text-white">{{ rb.count }}</span>
                  <span class="text-xs text-white/45 capitalize">{{ rb.role }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- ── USERS ───────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'users'">
          <div class="flex items-center gap-3 mb-5">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="userSearch" @input="onUserSearch" type="text" placeholder="Поиск пользователей…"
                class="w-full bg-white/5 border border-white/8 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25
                  outline-none focus:border-brand-accent/40 focus:bg-white/8 transition-all" />
            </div>
            <span class="text-xs font-bold text-white/35 bg-white/5 px-3 py-2 rounded-xl border border-white/8">{{ userTotal }}</span>
          </div>

          <div class="rounded-3xl border border-white/5 overflow-hidden" style="background:rgba(255,255,255,0.02)">
            <div v-if="isLoadingUsers" class="divide-y divide-white/5">
              <div v-for="n in 6" :key="n" class="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                <div class="w-9 h-9 rounded-full bg-white/8 flex-shrink-0" />
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-white/8 rounded-full w-32" />
                  <div class="h-2 bg-white/5 rounded-full w-24" />
                </div>
              </div>
            </div>
            <div v-else class="divide-y divide-white/5">
              <div v-for="user in users" :key="user.id"
                class="flex items-center gap-3 px-5 py-3 hover:bg-white/3 transition-all group">
                <div class="flex-shrink-0 relative">
                  <img v-if="user.avatar_url" :src="user.avatar_url"
                    class="w-9 h-9 rounded-full object-cover border border-white/10" />
                  <div v-else class="w-9 h-9 rounded-full border border-white/10 flex items-center justify-center text-sm font-bold"
                    :style="`background:${roleColor(user.role)}20;color:${roleColor(user.role)}`">
                    {{ (user.display_name || user.username || '?')[0].toUpperCase() }}
                  </div>
                  <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#0d0d1a] flex items-center justify-center"
                    :style="`background:${roleColor(user.role)}`">
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-sm text-white truncate flex items-center gap-1.5">
                    {{ user.display_name || user.username }}
                    <span v-if="user.frozen_at" title="Заморожен"
                      class="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/20">
                      🧊 freeze
                    </span>
                    <span v-if="user.warn_count > 0"
                      class="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      :class="user.warn_count >= 2 ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'">
                      ⚠️ {{ user.warn_count }}/3
                    </span>
                  </p>
                  <p class="text-xs text-white/35 truncate">@{{ user.username }} · {{ user._count?.posts ?? 0 }} постов · {{ formatDate(user.created_at) }}</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <select :value="user.role" @change="updateUserRole(user.id, ($event.target as HTMLSelectElement).value)"
                    class="bg-[#0d0d1a] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white/70 outline-none focus:border-brand-accent/50 cursor-pointer transition-colors">
                    <option value="user">user</option>
                    <option value="moderator">moderator</option>
                    <option value="admin">admin</option>
                  </select>
                  <!-- freeze / unfreeze -->
                  <button v-if="user.frozen_at" @click="unfreezeUser(user.id)" title="Разморозить"
                    class="w-7 h-7 rounded-xl bg-sky-500/10 border border-sky-500/15 text-sky-400 hover:bg-sky-500/20 flex items-center justify-center transition-all text-xs">
                    🔓
                  </button>
                  <button v-else @click="freezeUser(user.id)" title="Заморозить"
                    class="w-7 h-7 rounded-xl bg-sky-500/10 border border-sky-500/15 text-sky-400 hover:bg-sky-500/20 flex items-center justify-center transition-all text-xs">
                    🧊
                  </button>
                  <!-- clear warns -->
                  <button v-if="user.warn_count > 0" @click="clearUserWarns(user.id)" title="Сбросить варны"
                    class="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/15 text-amber-400 hover:bg-amber-500/20 flex items-center justify-center transition-all text-xs">
                    ✖
                  </button>
                  <button @click="deleteUser(user.id)"
                    class="w-7 h-7 rounded-xl bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-all">
                    <BIcon name="Trash2" class="w-3.5 h-3.5" />
                  </button>
                </div>
                <!-- Role pill (visible when row not hovered) -->
                <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full flex-shrink-0 group-hover:hidden"
                  :style="`background:${roleColor(user.role)}20;color:${roleColor(user.role)}`">
                  {{ user.role }}
                </span>
              </div>
            </div>
          </div>

          <div v-if="userTotal > 20" class="flex items-center justify-center gap-2 mt-4">
            <button @click="userPage--; fetchUsers()" :disabled="userPage <= 1"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <span class="text-xs font-bold text-white/40 px-3">{{ userPage }} / {{ Math.ceil(userTotal/20) }}</span>
            <button @click="userPage++; fetchUsers()" :disabled="userPage >= Math.ceil(userTotal/20)"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- ── ARCHIVED ────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'archived'">
          <div class="flex items-center gap-3 mb-5">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="archivedSearch" @input="onArchivedSearch" type="text" placeholder="Поиск в архиве…"
                class="w-full bg-white/5 border border-white/8 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25
                  outline-none focus:border-rose-500/40 focus:bg-white/8 transition-all" />
            </div>
            <span class="text-xs font-bold text-white/35 bg-white/5 px-3 py-2 rounded-xl border border-white/8">{{ archivedTotal }}</span>
          </div>

          <div class="rounded-3xl border border-white/5 overflow-hidden" style="background:rgba(255,255,255,0.02)">
            <div v-if="isLoadingArchived" class="divide-y divide-white/5">
              <div v-for="n in 4" :key="n" class="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                <div class="w-9 h-9 rounded-full bg-white/8 flex-shrink-0" />
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-white/8 rounded-full w-32" /><div class="h-2 bg-white/5 rounded-full w-24" />
                </div>
              </div>
            </div>
            <div v-else-if="archivedUsers.length === 0"
              class="flex flex-col items-center gap-3 py-16 text-white/25">
              <BIcon name="Archive" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">Архив пуст</p>
            </div>
            <div v-else class="divide-y divide-white/5">
              <div v-for="user in archivedUsers" :key="user.id"
                class="flex items-center gap-3 px-5 py-3 hover:bg-white/3 transition-all group opacity-60 hover:opacity-100">
                <img v-if="user.avatar_url" :src="user.avatar_url"
                  class="w-9 h-9 rounded-full object-cover border border-white/10 grayscale flex-shrink-0" />
                <div v-else class="w-9 h-9 rounded-full border border-white/8 bg-white/5 flex items-center justify-center text-xs font-bold text-white/30 flex-shrink-0">
                  {{ (user.display_name || user.username || '?')[0].toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-sm text-white/70 truncate">{{ user.display_name || user.username }}</p>
                  <p class="text-xs text-white/30">@{{ user.username }} · удалён {{ formatDate(user.deleted_at) }}</p>
                </div>
                <button @click="restoreUser(user.id)"
                  class="px-3 py-1.5 text-xs font-bold rounded-xl border opacity-0 group-hover:opacity-100 transition-all
                  bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20">
                  Восстановить
                </button>
              </div>
            </div>
          </div>

          <div v-if="archivedTotal > 20" class="flex items-center justify-center gap-2 mt-4">
            <button @click="archivedPage--; fetchArchivedUsers()" :disabled="archivedPage <= 1"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <span class="text-xs font-bold text-white/40 px-3">{{ archivedPage }} / {{ Math.ceil(archivedTotal/20) }}</span>
            <button @click="archivedPage++; fetchArchivedUsers()" :disabled="archivedPage >= Math.ceil(archivedTotal/20)"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- ── POSTS ──────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'posts'">
          <div class="flex items-center gap-3 mb-5">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="postSearch" @input="onPostSearch" type="text" placeholder="Поиск по постам…"
                class="w-full bg-white/5 border border-white/8 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25
                  outline-none focus:border-brand-accent/40 focus:bg-white/8 transition-all" />
            </div>
            <span class="text-xs font-bold text-white/35 bg-white/5 px-3 py-2 rounded-xl border border-white/8">{{ postTotal }}</span>
          </div>

          <div class="rounded-3xl border border-white/5 overflow-hidden" style="background:rgba(255,255,255,0.02)">
            <div v-if="isLoadingPosts" class="divide-y divide-white/5">
              <div v-for="n in 5" :key="n" class="flex items-start gap-3 px-5 py-4 animate-pulse">
                <div class="w-9 h-9 rounded-full bg-white/8 flex-shrink-0 mt-0.5" />
                <div class="flex-1 space-y-2">
                  <div class="h-2 bg-white/5 rounded-full w-24" />
                  <div class="h-3 bg-white/8 rounded-full w-3/4" />
                  <div class="h-3 bg-white/5 rounded-full w-1/2" />
                </div>
              </div>
            </div>
            <div v-else class="divide-y divide-white/5">
              <div v-for="post in posts" :key="post.id"
                class="flex items-start gap-3 px-5 py-4 hover:bg-white/3 transition-all group">
                <img v-if="post.author?.avatar_url" :src="post.author.avatar_url"
                  class="w-9 h-9 rounded-full object-cover border border-white/10 flex-shrink-0 mt-0.5" />
                <div v-else class="w-9 h-9 rounded-full border border-white/10 bg-brand-accent/15 flex items-center justify-center text-brand-accent font-bold text-sm flex-shrink-0 mt-0.5">
                  {{ (post.author?.display_name || post.author?.username || '?')[0].toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <span class="text-xs font-bold text-white/45">@{{ post.author?.username }}</span>
                    <span class="text-[10px] text-white/25">{{ formatDate(post.created_at) }}</span>
                    <span v-if="post.is_nsfw"
                      class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/20 text-rose-400">
                      NSFW
                    </span>
                  </div>
                  <p class="text-sm text-white/80 line-clamp-2 leading-relaxed">{{ post.content }}</p>
                  <div class="flex items-center gap-3 mt-1.5 text-[10px] text-white/30 font-semibold">
                    <span class="flex items-center gap-1"><BIcon name="Heart" class="w-3 h-3" />{{ post._count?.votes ?? 0 }}</span>
                    <span class="flex items-center gap-1"><BIcon name="MessageCircle" class="w-3 h-3" />{{ post._count?.comments ?? 0 }}</span>
                  </div>
                </div>
                <button @click="deletePost(post.id)"
                  class="w-7 h-7 rounded-xl bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20
                    flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                  <BIcon name="Trash2" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div v-if="postTotal > 20" class="flex items-center justify-center gap-2 mt-4">
            <button @click="postPage--; fetchPosts()" :disabled="postPage <= 1"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <span class="text-xs font-bold text-white/40 px-3">{{ postPage }} / {{ Math.ceil(postTotal/20) }}</span>
            <button @click="postPage++; fetchPosts()" :disabled="postPage >= Math.ceil(postTotal/20)"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- ── REPORTS ─────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'reports'">
          <!-- Filter pills -->
          <div class="flex gap-2 mb-5 flex-wrap">
            <button v-for="s in (['', 'pending', 'resolved', 'dismissed'] as const)" :key="s"
              @click="reportFilter = s; fetchReports()"
              class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
              :class="reportFilter === s
                ? 'bg-amber-500/15 border-amber-500/25 text-amber-400'
                : 'bg-white/5 border-white/8 text-white/40 hover:text-white/70'">
              {{ { '': 'Все', pending: 'Ожидают', resolved: 'Решены', dismissed: 'Отклонены' }[s] }}
            </button>
          </div>

          <div class="rounded-3xl border border-white/5 overflow-hidden" style="background:rgba(255,255,255,0.02)">
            <div v-if="isLoadingReports" class="divide-y divide-white/5">
              <div v-for="n in 4" :key="n" class="flex gap-3 px-5 py-4 animate-pulse">
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-white/8 rounded-full w-48" /><div class="h-2 bg-white/5 rounded-full w-32" />
                </div>
              </div>
            </div>
            <div v-else-if="reports.length === 0"
              class="flex flex-col items-center gap-3 py-16 text-white/25">
              <BIcon name="Flag" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">Жалоб нет</p>
            </div>
            <div v-else class="divide-y divide-white/5">
              <div v-for="report in reports" :key="report.id"
                class="flex items-start gap-4 px-5 py-4 hover:bg-white/3 transition-all">
                <!-- Status dot -->
                <div class="flex-shrink-0 mt-0.5">
                  <div class="w-2.5 h-2.5 rounded-full mt-1"
                    :style="`background:${report.status==='pending'?'#f59e0b':report.status==='resolved'?'#10b981':'#6b7280'}`" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <span class="text-xs font-bold px-2 py-0.5 rounded-full border"
                      :class="report.status === 'pending'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        : report.status === 'resolved'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : 'text-white/30 bg-white/5 border-white/10'">
                      {{ { pending: 'Ожидает', resolved: 'Решено', dismissed: 'Отклонено' }[report.status] }}
                    </span>
                    <span class="text-[10px] text-white/25 capitalize">{{ report.target_type }}</span>
                    <span class="text-[10px] text-white/25">{{ formatDate(report.created_at) }}</span>
                  </div>
                  <p class="text-sm text-white/80 font-medium">{{ report.reason }}</p>
                  <p class="text-xs text-white/30 mt-0.5">от @{{ report.reporter?.username }}</p>
                </div>
                <div v-if="report.status === 'pending'" class="flex gap-2 flex-shrink-0">
                  <button @click="resolveReport(report.id, 'resolved')"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                    ✓ Решено
                  </button>
                  <button @click="resolveReport(report.id, 'dismissed')"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 border border-white/8 text-white/40 hover:text-white transition-all">
                    Откл.
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── ADS ────────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'ads'">
          <div class="flex items-center justify-between mb-5">
            <p class="text-xs text-white/35 font-semibold">{{ ads.length }} объявлений</p>
            <button @click="showAdForm = !showAdForm"
              class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-lg text-white"
              style="background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 4px 16px rgba(99,102,241,0.3)">
              <BIcon name="Plus" class="w-3.5 h-3.5" /> Создать
            </button>
          </div>

          <!-- Create form -->
          <Transition name="filter-expand">
            <div v-if="showAdForm"
              class="rounded-3xl border border-brand-accent/20 p-6 mb-5 shadow-xl"
              style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))">
              <h4 class="font-extrabold text-sm text-white mb-4">Новое объявление</h4>
              <div class="space-y-3">
                <input v-model="newAd.title" placeholder="Заголовок *"
                  class="adm-input" />
                <textarea v-model="newAd.description" placeholder="Описание"
                  class="adm-input resize-none h-20" />
                <input v-model="newAd.linkUrl" type="url" placeholder="Ссылка *"
                  class="adm-input" />
                <div>
                  <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Изображение (опционально)</p>
                  <div v-if="newAd.imageUrl" class="flex items-center gap-3 p-3 bg-white/5 border border-white/8 rounded-2xl">
                    <img :src="newAd.imageUrl" class="w-16 h-12 object-cover rounded-xl flex-shrink-0" />
                    <span class="flex-1 text-xs text-white/45 truncate">Загружено</span>
                    <button @click="newAd.imageUrl = ''" class="w-7 h-7 rounded-full bg-white/8 hover:bg-rose-500/20 flex items-center justify-center transition-all">
                      <BIcon name="X" class="w-3.5 h-3.5 text-white/60" />
                    </button>
                  </div>
                  <MediaUpload v-else type="banners" @uploaded="(urls) => newAd.imageUrl = urls[0] ?? ''" />
                </div>
              </div>
              <div class="flex gap-2 justify-end mt-4">
                <button @click="showAdForm = false"
                  class="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white hover:bg-white/5 border border-white/8 transition-all">Отмена</button>
                <button @click="submitAd" :disabled="isSubmittingAd || !newAd.title || !newAd.linkUrl"
                  class="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all shadow-lg"
                  style="background:linear-gradient(135deg,#6366f1,#8b5cf6);box-shadow:0 4px 12px rgba(99,102,241,0.3)">
                  {{ isSubmittingAd ? '...' : 'Создать' }}
                </button>
              </div>
            </div>
          </Transition>

          <div v-if="isLoadingAds" class="space-y-3">
            <div v-for="n in 3" :key="n" class="h-24 rounded-3xl bg-white/5 animate-pulse" />
          </div>
          <div v-else-if="ads.length === 0"
            class="flex flex-col items-center gap-3 py-20 text-white/25">
            <BIcon name="Megaphone" class="w-10 h-10 opacity-40" />
            <p class="text-sm font-semibold">Объявлений нет</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="ad in ads" :key="ad.id"
              class="rounded-3xl border border-white/5 p-4 flex items-start gap-4 hover:border-white/10 transition-all"
              style="background:rgba(255,255,255,0.02)">
              <img v-if="ad.image_url" :src="ad.image_url" class="w-16 h-16 rounded-2xl object-cover border border-white/8 flex-shrink-0" />
              <div v-else class="w-16 h-16 rounded-2xl bg-white/5 border border-white/8 flex-shrink-0 flex items-center justify-center">
                <BIcon name="Image" class="w-5 h-5 text-white/20" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1 flex-wrap">
                  <span class="text-xs font-extrabold px-2 py-0.5 rounded-full border"
                    :class="ad.status==='active'
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : ad.status==='pending'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        : 'text-white/30 bg-white/5 border-white/10'">
                    {{ ad.status }}
                  </span>
                  <span class="text-[10px] text-white/30">{{ ad.impressions ?? 0 }} показов · {{ ad.clicks ?? 0 }} кликов</span>
                </div>
                <p class="font-bold text-sm text-white">{{ ad.title }}</p>
                <p v-if="ad.description" class="text-xs text-white/40 mt-0.5 line-clamp-1">{{ ad.description }}</p>
                <a :href="ad.link_url" target="_blank" class="text-xs text-brand-accent hover:text-brand-accent/80 mt-0.5 block truncate transition-colors">{{ ad.link_url }}</a>
              </div>
              <div v-if="ad.status === 'pending'" class="flex flex-col gap-2 flex-shrink-0">
                <button @click="reviewAd(ad.id, 'active')"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                  Одобрить
                </button>
                <button @click="reviewAd(ad.id, 'rejected')"
                  class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-all">
                  Отклонить
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── VERIFICATION ────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'verification'">
          <div class="flex gap-2 mb-5 flex-wrap">
            <button v-for="s in (['', 'pending', 'approved', 'rejected'] as const)" :key="s"
              @click="verFilter = s; fetchVerRequests()"
              class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
              :class="verFilter === s
                ? 'bg-blue-500/15 border-blue-500/25 text-blue-400'
                : 'bg-white/5 border-white/8 text-white/40 hover:text-white/70'">
              {{ { '': 'Все', pending: 'Ожидают', approved: 'Одобрены', rejected: 'Отклонены' }[s] }}
            </button>
          </div>

          <div class="space-y-3">
            <div v-if="isLoadingVer">
              <div v-for="n in 3" :key="n" class="h-28 rounded-3xl bg-white/5 animate-pulse" />
            </div>
            <div v-else-if="verRequests.length === 0"
              class="flex flex-col items-center gap-3 py-20 text-white/25">
              <BIcon name="BadgeCheck" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">Заявок нет</p>
            </div>
            <div v-else>
              <div v-for="req in verRequests" :key="req.id"
                class="rounded-3xl border border-white/5 overflow-hidden hover:border-blue-500/15 transition-all"
                style="background:rgba(255,255,255,0.02)">
                <div class="px-5 py-4 flex items-start gap-4">
                  <img v-if="req.user?.avatar_url" :src="req.user.avatar_url"
                    class="w-10 h-10 rounded-2xl object-cover border border-white/10 flex-shrink-0" />
                  <div v-else class="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold flex-shrink-0">
                    {{ (req.user?.display_name || req.user?.username || '?')[0].toUpperCase() }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap mb-1.5">
                      <span class="text-xs font-extrabold px-2 py-0.5 rounded-full border"
                        :class="req.status==='pending'
                          ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                          : req.status==='approved'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                            : 'text-rose-400 bg-rose-500/10 border-rose-500/20'">
                        {{ {pending:'Ожидает',approved:'Одобрено',rejected:'Отклонено'}[req.status] }}
                      </span>
                      <span v-if="req.verification_type"
                        class="text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1"
                        :class="verTypeColors[req.verification_type] || 'text-blue-400 bg-blue-400/10 border-blue-400/20'">
                        <img :src="`/icons/badges/${req.verification_type}.svg`" class="w-3 h-3" />
                        {{ verTypeLabels[req.verification_type] || req.verification_type }}
                      </span>
                      <span class="text-[10px] text-white/25">{{ formatDate(req.created_at) }}</span>
                    </div>
                    <p class="font-extrabold text-sm text-white">{{ req.user?.display_name || req.user?.username }}</p>
                    <p class="text-xs text-white/35 mt-0.5">@{{ req.user?.username }}</p>

                    <!-- Criteria chips -->
                    <div class="flex flex-wrap gap-1.5 mt-3">
                      <span v-for="chip in [
                        {label: req.account_age_days+'дн.', ok: req.account_age_days>=14},
                        {label: req.post_count+' постов', ok: req.post_count>=3},
                        {label: 'Аватар', ok: req.has_avatar},
                        {label: 'Био', ok: req.has_bio},
                        {label: 'Email', ok: req.has_email},
                        {label: req.follower_count+' подписч.', ok: req.follower_count>=5},
                      ]" :key="chip.label"
                        class="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                        :class="chip.ok
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : 'text-rose-400 bg-rose-500/10 border-rose-500/15'">
                        {{ chip.ok ? '✓' : '✗' }} {{ chip.label }}
                      </span>
                    </div>

                    <!-- Evidence -->
                    <div v-if="req.evidence_urls?.length" class="mt-3">
                      <button @click="expandedEvidence = expandedEvidence===req.id ? null : req.id"
                        class="text-xs font-bold flex items-center gap-1 transition-colors text-blue-400 hover:text-blue-300">
                        <BIcon name="Image" class="w-3 h-3" />
                        Доказательства ({{ req.evidence_urls.length }})
                        <BIcon name="ChevronRight" class="w-3 h-3 transition-transform" :class="expandedEvidence===req.id ? 'rotate-90' : ''" />
                      </button>
                      <div v-if="expandedEvidence===req.id" class="grid grid-cols-4 gap-2 mt-2">
                        <a v-for="(url,i) in req.evidence_urls" :key="i" :href="url" target="_blank"
                          class="aspect-square rounded-xl overflow-hidden border border-white/8 hover:border-blue-500/30 transition-all">
                          <img :src="url" class="w-full h-full object-cover" />
                        </a>
                      </div>
                    </div>
                  </div>

                  <div v-if="req.status === 'pending'" class="flex flex-col gap-2 flex-shrink-0">
                    <button @click="reviewVerRequest(req.id,'approve')"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                      ✓ Одобрить
                    </button>
                    <button @click="reviewVerRequest(req.id,'reject',prompt('Причина:') || undefined)"
                      class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-all">
                      Отклонить
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── BANNERS ─────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'banners'">
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-xs text-white/35 font-semibold">{{ banners.length }}/7 баннеров · карусель стикеров</p>
            </div>
            <button @click="openBannerCreate" :disabled="banners.length >= 7"
              class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
              style="background:linear-gradient(135deg,#8b5cf6,#6366f1);box-shadow:0 4px 16px rgba(139,92,246,0.3)">
              <BIcon name="Plus" class="w-3.5 h-3.5" /> Новый баннер
            </button>
          </div>

          <!-- Form -->
          <div v-if="showBannerForm"
            class="rounded-3xl border border-brand-purple/20 p-6 mb-5 shadow-xl"
            style="background:linear-gradient(135deg,rgba(139,92,246,0.08),rgba(99,102,241,0.04))">
            <h3 class="font-extrabold text-sm text-white mb-5">
              {{ editingBannerId ? '✏️ Редактировать баннер' : '✨ Создать баннер' }}
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Заголовок *</label>
                <input v-model="bannerForm.title" placeholder="Например: Весенняя коллекция 🌸" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Подзаголовок</label>
                <input v-model="bannerForm.subtitle" placeholder="Краткое описание" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Тег (пилюля)</label>
                <input v-model="bannerForm.tag_label" placeholder="Новинка" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Цена / подпись</label>
                <input v-model="bannerForm.price_label" placeholder="От 99 ₽" class="adm-input" />
              </div>
              <div class="sm:col-span-2">
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Изображение баннера</label>
                <div v-if="bannerForm.image_url" class="flex items-center gap-3 p-3 bg-white/5 border border-white/8 rounded-2xl">
                  <img :src="bannerForm.image_url" class="w-20 h-12 object-cover rounded-xl flex-shrink-0 border border-white/10" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-white/60">Изображение загружено</p>
                    <p class="text-[10px] text-white/30 truncate mt-0.5">{{ bannerForm.image_url }}</p>
                  </div>
                  <button type="button" @click="bannerForm.image_url = ''"
                    class="w-7 h-7 rounded-full bg-white/8 hover:bg-rose-500/20 flex items-center justify-center transition-all flex-shrink-0">
                    <BIcon name="X" class="w-3.5 h-3.5 text-white/60" />
                  </button>
                </div>
                <MediaUpload v-else type="banners" @uploaded="(urls) => bannerForm.image_url = urls[0] ?? ''" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Ссылка</label>
                <input v-model="bannerForm.link_url" placeholder="/stickers?tag=spring" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Градиент (CSS)</label>
                <input v-model="bannerForm.gradient" placeholder="linear-gradient(135deg,#FF6B9D,#C62A88)" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">Порядок</label>
                <input v-model.number="bannerForm.sort_order" type="number" min="0" class="adm-input" />
              </div>
              <div class="flex items-end pb-0.5">
                <button type="button" @click="bannerForm.is_active = !bannerForm.is_active"
                  class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold border transition-all"
                  :class="bannerForm.is_active
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-white/5 text-white/40 border-white/8'">
                  <BIcon :name="bannerForm.is_active ? 'Eye' : 'EyeOff'" class="w-4 h-4" />
                  {{ bannerForm.is_active ? 'Активен' : 'Скрыт' }}
                </button>
              </div>
            </div>

            <!-- Live preview -->
            <div v-if="bannerForm.gradient || bannerForm.image_url"
              class="mt-5 rounded-2xl overflow-hidden h-28 relative border border-white/8">
              <img v-if="bannerForm.image_url" :src="bannerForm.image_url" class="absolute inset-0 w-full h-full object-cover" />
              <div class="absolute inset-0" :style="bannerForm.gradient ? `background:${bannerForm.gradient};opacity:0.65` : 'background:#1a1a2e'" />
              <div class="absolute inset-0 p-4 flex flex-col justify-end">
                <span v-if="bannerForm.tag_label"
                  class="self-start mb-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/20 text-white backdrop-blur-sm">
                  {{ bannerForm.tag_label }}
                </span>
                <p class="text-white font-extrabold text-base leading-tight drop-shadow">{{ bannerForm.title || 'Заголовок' }}</p>
                <p v-if="bannerForm.subtitle" class="text-white/75 text-xs mt-0.5 drop-shadow">{{ bannerForm.subtitle }}</p>
              </div>
              <div class="absolute top-2 right-2 text-[9px] font-bold px-2 py-0.5 rounded-full bg-black/50 text-white/60">
                PREVIEW
              </div>
            </div>

            <p v-if="bannerError" class="text-rose-400 text-xs mt-3 font-semibold">{{ bannerError }}</p>

            <div class="flex gap-3 mt-5">
              <button @click="saveBanner"
                class="px-5 py-2.5 rounded-2xl text-sm font-bold text-white shadow-lg transition-all"
                style="background:linear-gradient(135deg,#8b5cf6,#6366f1);box-shadow:0 4px 14px rgba(139,92,246,0.35)">
                Сохранить
              </button>
              <button @click="showBannerForm = false"
                class="px-5 py-2.5 rounded-2xl text-sm font-bold bg-white/5 border border-white/8 text-white/50 hover:text-white transition-all">
                Отмена
              </button>
            </div>
          </div>

          <!-- Loading -->
          <div v-if="isLoadingBanners" class="space-y-3">
            <div v-for="n in 3" :key="n" class="h-28 rounded-3xl bg-white/5 animate-pulse" />
          </div>

          <!-- Empty -->
          <div v-else-if="!banners.length && !showBannerForm"
            class="flex flex-col items-center gap-4 py-24 text-white/25">
            <div class="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center">
              <BIcon name="Image" class="w-8 h-8 opacity-50" />
            </div>
            <p class="text-sm font-semibold">Нет баннеров</p>
            <p class="text-xs text-center max-w-xs">Нажмите «Новый баннер» чтобы добавить первый баннер для карусели</p>
          </div>

          <!-- List -->
          <div v-else class="space-y-3">
            <div v-for="b in banners" :key="b.id"
              class="rounded-3xl border border-white/5 overflow-hidden hover:border-brand-purple/20 transition-all group"
              style="background:rgba(255,255,255,0.02)">
              <div class="flex items-center gap-4 p-4">
                <!-- Thumbnail -->
                <div class="w-24 h-16 rounded-2xl overflow-hidden flex-shrink-0 border border-white/8 relative">
                  <img v-if="b.image_url" :src="b.image_url" class="absolute inset-0 w-full h-full object-cover" />
                  <div class="absolute inset-0"
                    :style="b.gradient ? `background:${b.gradient};opacity:0.7` : 'background:#1a1a2e'" />
                  <div class="absolute inset-0 p-1.5 flex flex-col justify-end">
                    <p class="text-white text-[9px] font-extrabold leading-tight drop-shadow line-clamp-2">{{ b.title }}</p>
                  </div>
                </div>
                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap mb-1">
                    <span class="font-extrabold text-sm text-white">{{ b.title }}</span>
                    <span v-if="b.tag_label"
                      class="text-[10px] font-bold px-1.5 py-0.5 rounded-full border"
                      style="background:rgba(139,92,246,0.15);border-color:rgba(139,92,246,0.25);color:#a78bfa">
                      {{ b.tag_label }}
                    </span>
                    <span :class="b.is_active ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-white/25 bg-white/5 border-white/10'"
                      class="text-[10px] font-bold px-1.5 py-0.5 rounded-full border">
                      {{ b.is_active ? '● Активен' : '○ Скрыт' }}
                    </span>
                  </div>
                  <p v-if="b.subtitle" class="text-xs text-white/35 truncate">{{ b.subtitle }}</p>
                  <p class="text-[10px] text-white/20 mt-0.5">Порядок {{ b.sort_order }}{{ b.price_label ? ` · ${b.price_label}` : '' }}</p>
                </div>
                <!-- Actions -->
                <div class="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button @click="toggleBannerActive(b)"
                    class="w-8 h-8 rounded-xl border flex items-center justify-center transition-all"
                    :class="b.is_active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-white/5 border-white/8 text-white/35 hover:text-white'">
                    <BIcon :name="b.is_active ? 'Eye' : 'EyeOff'" class="w-3.5 h-3.5" />
                  </button>
                  <button @click="openBannerEdit(b)"
                    class="w-8 h-8 rounded-xl bg-white/5 border border-white/8 text-white/40 hover:text-white hover:border-brand-purple/30 flex items-center justify-center transition-all">
                    <BIcon name="Pencil" class="w-3.5 h-3.5" />
                  </button>
                  <button @click="deleteBanner(b.id)"
                    class="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-all">
                    <BIcon name="Trash2" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="banners.length >= 7"
            class="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl border"
            style="background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.2)">
            <BIcon name="AlertTriangle" class="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p class="text-xs font-semibold text-amber-400">Достигнут лимит 7 баннеров. Удалите один чтобы добавить новый.</p>
          </div>
        </div>

        <!-- ── AUTOMOD ────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'automod'">
          <!-- Filters -->
          <div class="flex items-center gap-2 mb-5 flex-wrap">
            <select v-model="autoModActionFilter" @change="autoModPage=1; fetchAutoModLogs()"
              class="bg-[#0d0d1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 outline-none focus:border-rose-500/40 cursor-pointer">
              <option value="">Все действия</option>
              <option value="warn">⚠️ warn</option>
              <option value="freeze">🧊 freeze</option>
              <option value="unfreeze">🔓 unfreeze</option>
              <option value="ban">🚫 ban</option>
              <option value="flag_post">🚩 flag_post</option>
              <option value="clear_warns">✖ clear_warns</option>
            </select>
            <select v-model="autoModCategoryFilter" @change="autoModPage=1; fetchAutoModLogs()"
              class="bg-[#0d0d1a] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 outline-none focus:border-rose-500/40 cursor-pointer">
              <option value="">Все категории</option>
              <option value="spam">🔁 spam</option>
              <option value="toxic">🤬 toxic</option>
              <option value="duplicate">📋 duplicate</option>
              <option value="fraud">🚨 fraud</option>
              <option value="suspicious">👁️ suspicious</option>
              <option value="manual">🛡️ manual</option>
            </select>
            <button @click="fetchAutoModLogs()"
              class="px-3 py-2 rounded-xl bg-white/5 border border-white/8 text-xs text-white/50 hover:text-white transition-all">
              <BIcon name="RefreshCw" class="w-3.5 h-3.5" />
            </button>
            <span class="ml-auto text-xs font-bold text-white/30 bg-white/5 px-3 py-2 rounded-xl border border-white/8">{{ autoModTotal }} событий</span>
          </div>

          <!-- Logs -->
          <div class="rounded-3xl border border-white/5 overflow-hidden" style="background:rgba(255,255,255,0.02)">
            <div v-if="isLoadingAutoMod" class="divide-y divide-white/5">
              <div v-for="n in 8" :key="n" class="flex items-center gap-3 px-5 py-3 animate-pulse">
                <div class="w-8 h-8 rounded-full bg-white/8 flex-shrink-0" />
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-white/8 rounded-full w-48" />
                  <div class="h-2 bg-white/5 rounded-full w-32" />
                </div>
                <div class="h-5 w-14 bg-white/8 rounded-full" />
              </div>
            </div>
            <div v-else-if="!autoModLogs.length" class="flex flex-col items-center gap-4 py-20 text-white/25">
              <div class="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl">🛡️</div>
              <p class="text-sm font-semibold">Журнал пуст</p>
              <p class="text-xs">AutoMod пока не зафиксировал нарушений</p>
            </div>
            <div v-else class="divide-y divide-white/5">
              <div v-for="log in autoModLogs" :key="log.id"
                class="flex items-start gap-3 px-5 py-3.5 hover:bg-white/2 transition-all">
                <!-- Avatar -->
                <img v-if="log.user?.avatar_url" :src="log.user.avatar_url"
                  class="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0 mt-0.5" />
                <div v-else
                  class="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center text-xs font-bold text-white/50 flex-shrink-0 mt-0.5">
                  {{ (log.user?.username ?? '?')[0].toUpperCase() }}
                </div>
                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-white flex items-center gap-1.5 flex-wrap">
                    <span class="text-base leading-none">{{ categoryEmoji(log.category) }}</span>
                    <span class="truncate">@{{ log.user?.username ?? log.user_id }}</span>
                    <span class="text-white/30">·</span>
                    <span class="font-extrabold uppercase text-[11px] tracking-wide" :style="`color:${actionColor(log.action)}`">{{ log.action }}</span>
                  </p>
                  <p class="text-xs text-white/50 mt-0.5 line-clamp-2">{{ log.reason }}</p>
                  <p v-if="log.details" class="text-[10px] text-white/25 mt-0.5 font-mono truncate">{{ log.details }}</p>
                </div>
                <!-- Time badge -->
                <span class="text-[10px] text-white/25 font-semibold flex-shrink-0 mt-1">{{ formatDate(log.created_at) }}</span>
              </div>
            </div>
          </div>

          <!-- Pagination -->
          <div v-if="autoModPages > 1" class="flex items-center justify-center gap-2 mt-4">
            <button @click="autoModPage--; fetchAutoModLogs()" :disabled="autoModPage <= 1"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <span class="text-xs font-bold text-white/40 px-3">{{ autoModPage }} / {{ autoModPages }}</span>
            <button @click="autoModPage++; fetchAutoModLogs()" :disabled="autoModPage >= autoModPages"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/8 text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

      </main>
    </div>
  </div>
</template>

<style scoped>
.filter-expand-enter-active, .filter-expand-leave-active { transition: all 0.2s ease; }
.filter-expand-enter-from, .filter-expand-leave-to { opacity: 0; transform: translateY(-8px); }

.adm-input {
  @apply w-full rounded-2xl px-4 py-2.5 text-sm text-white outline-none transition-all;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  color: white;
}
.adm-input::placeholder { color: rgba(255,255,255,0.25); }
.adm-input:focus { border-color: rgba(139,92,246,0.4); background: rgba(255,255,255,0.08); }
</style>
