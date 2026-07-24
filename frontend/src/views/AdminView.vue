<script setup lang="ts">
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'
import BIcon from '../components/BIcon.vue'
import MediaUpload from '../components/MediaUpload.vue'
import PostLightbox from '../components/PostLightbox.vue'
import ResolveReportModal from '../components/ResolveReportModal.vue'
import { useConfirm } from '@/composables/useConfirm'

const router = useRouter()
const auth = useAuthStore()
const { confirmDialog } = useConfirm()

// ── Staff role hierarchy: user < moderator < admin < owner ──────────────
const ROLE_RANK: Record<string, number> = { user: 0, moderator: 1, admin: 2, owner: 3 }
const myRole = computed<string>(() => (auth.user as any)?.role ?? 'user')
const myRoleRank = computed(() => ROLE_RANK[myRole.value] ?? 0)
const isOwnerRole = computed(() => myRole.value === 'owner')
const isAdminPlus = computed(() => myRoleRank.value >= ROLE_RANK.admin)
const roleLabel = (role: string) => ({ owner: 'Владелец', admin: 'Администратор', moderator: 'Модератор', user: 'Пользователь' }[role] ?? role)

// Guard: staff only (moderator and above)
onMounted(async () => {
  await auth.fetchMe()
  const role = (auth.user as any)?.role
  if (!role || (ROLE_RANK[role] ?? 0) < ROLE_RANK.moderator) {
    router.replace({ name: 'home' })
  } else {
    fetchStats()
    fetchStatistics()
  }
})

// ── Tabs ──────────────────────────────────────────────────────────────
const activeTab = ref<'overview' | 'users' | 'frozen' | 'archived' | 'posts' | 'reports' | 'appeals' | 'support' | 'ads' | 'verification' | 'banners' | 'automod' | 'statistics' | 'updates' | 'groups' | 'finance' | 'team' | 'broadcasts' | 'settings' | 'infra'>('overview')

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
const userSort = ref<'privilege' | 'newest' | 'oldest' | 'posts' | 'posts_asc' | 'followers' | 'followers_asc' | 'subscription'
  | 'username' | 'username_desc' | 'email_asc' | 'email_desc' | 'status_asc' | 'status_desc' | 'verification_asc' | 'verification_desc'>('privilege')
const userQuickStats = ref({ newToday: 0, subscribers: 0, frozen: 0 })
const isLoadingUsers = ref(false)
let userSearchDebounce: ReturnType<typeof setTimeout>

const userSortOptions = [
  { value: 'privilege',    label: 'По привилегии' },
  { value: 'newest',       label: 'Сначала новые' },
  { value: 'oldest',       label: 'Сначала старые' },
  { value: 'posts',        label: 'По постам' },
  { value: 'followers',    label: 'По подписчикам' },
  { value: 'subscription', label: 'По подписке' },
  { value: 'username',     label: 'По имени' },
]
const userSortLabel = computed(() => userSortOptions.find(o => o.value === userSort.value)?.label ?? 'Сортировка')
const userSortOpen = ref(false)
const userSortRef = ref<HTMLElement | null>(null)
const onClickOutsideUserSort = (e: MouseEvent) => {
  if (userSortRef.value && !userSortRef.value.contains(e.target as Node)) userSortOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', onClickOutsideUserSort))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutsideUserSort))

const tierLabel = (tier?: string) => ({ lite: 'Lite', pro: 'Pro', business: 'Business' }[tier ?? ''] ?? null)
const tierColor = (tier?: string) => ({ lite: '#4C67CF', pro: '#a78bfa', business: '#f59e0b' }[tier ?? ''] ?? '#64748b')

const userStatus = (user: any): { label: string; color: string } => {
  if (user.deceased_at) return { label: 'Умер', color: '#94a3b8' }
  if (user.frozen_at) return { label: 'Заморожен', color: '#38bdf8' }
  return { label: 'Активен', color: '#66C770' }
}

const fetchUsers = async () => {
  isLoadingUsers.value = true
  try {
    const res = await api.get('/admin/users', { params: { page: userPage.value, search: userSearch.value || undefined, sortBy: userSort.value } })
    if (res.data.success) {
      users.value = res.data.data.users
      userTotal.value = res.data.data.total
      if (res.data.data.stats) userQuickStats.value = res.data.data.stats
    }
  } catch {} finally { isLoadingUsers.value = false }
}

const onUserSearch = () => {
  clearTimeout(userSearchDebounce)
  userSearchDebounce = setTimeout(() => { userPage.value = 1; fetchUsers() }, 300)
}

const selectUserSort = (value: typeof userSort.value) => {
  userSort.value = value
  userSortOpen.value = false
  userPage.value = 1
  fetchUsers()
}

// ── Sortable table headers — click a column to sort by it, click again to flip direction
const userColumns = [
  { label: 'Пользователь',  values: ['username', 'username_desc'] },
  { label: 'Email',         values: ['email_asc', 'email_desc'] },
  { label: 'Статус',        values: ['status_desc', 'status_asc'] },
  { label: 'Регистрация',   values: ['newest', 'oldest'] },
  { label: 'Постов',        values: ['posts', 'posts_asc'] },
  { label: 'Подписчиков',   values: ['followers', 'followers_asc'] },
  { label: 'Верификация',   values: ['verification_desc', 'verification_asc'] },
] as const
const userColumnDirection = (col: typeof userColumns[number]): 'asc' | 'desc' | null => {
  const idx = (col.values as readonly string[]).indexOf(userSort.value)
  return idx === 0 ? 'desc' : idx === 1 ? 'asc' : null
}
const toggleUserColumnSort = (col: typeof userColumns[number]) => {
  const dir = userColumnDirection(col)
  selectUserSort((dir === 'desc' ? col.values[1] : col.values[0]) as typeof userSort.value)
}

const updateUserRole = async (userId: string, role: string) => {
  try {
    await api.patch(`/admin/users/${userId}/role`, { role })
    const u = users.value.find(u => u.id === userId)
    if (u) u.role = role
  } catch {}
}

const updateUserSubscription = async (userId: string, tier: string) => {
  try {
    await api.patch(`/admin/users/${userId}/subscription`, { tier })
    const u = users.value.find(u => u.id === userId)
    if (u) u.subscription_tier = tier
  } catch {}
}

// ── Per-row user tier / role dropdowns ──────────────────────────────────
const tierMenuOptions = [
  { value: 'free',     label: 'Без подписки' },
  { value: 'lite',     label: 'Lite' },
  { value: 'pro',      label: 'Pro' },
  { value: 'business', label: 'Business' },
]
const roleMenuOptions = [
  { value: 'user',      label: 'Пользователь' },
  { value: 'moderator', label: 'Модератор' },
  { value: 'admin',     label: 'Администратор' },
  { value: 'owner',     label: 'Владелец' },
]
const activeUserMenu = ref<string | null>(null)
const userMenuPos = ref({ top: 0, right: 0 })
const toggleUserMenu = (key: string, e: MouseEvent) => {
  if (activeUserMenu.value === key) { activeUserMenu.value = null; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  userMenuPos.value = { top: rect.bottom + 6, right: window.innerWidth - rect.right }
  activeUserMenu.value = key
}
const onClickOutsideUserMenu = (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('[data-user-menu]')) activeUserMenu.value = null
}
const onScrollCloseUserMenu = () => { activeUserMenu.value = null }
onMounted(() => {
  document.addEventListener('mousedown', onClickOutsideUserMenu)
  window.addEventListener('scroll', onScrollCloseUserMenu, true)
  window.addEventListener('resize', onScrollCloseUserMenu)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutsideUserMenu)
  window.removeEventListener('scroll', onScrollCloseUserMenu, true)
  window.removeEventListener('resize', onScrollCloseUserMenu)
})

const selectUserTier = (userId: string, tier: string) => {
  updateUserSubscription(userId, tier)
  activeUserMenu.value = null
}
const selectUserRole = (userId: string, role: string) => {
  updateUserRole(userId, role)
  activeUserMenu.value = null
}

const deleteUser = async (userId: string) => {
  if (!(await confirmDialog('Удалить пользователя?', { danger: true }))) return
  try {
    await api.delete(`/admin/users/${userId}`)
    users.value = users.value.filter(u => u.id !== userId)
  } catch {}
}

// ── Frozen Users ──────────────────────────────────────────────────────
const frozenUsers = ref<any[]>([])
const frozenPage = ref(1)
const frozenTotal = ref(0)
const frozenSearch = ref('')
const isLoadingFrozen = ref(false)
let frozenSearchDebounce: ReturnType<typeof setTimeout>

const fetchFrozenUsers = async () => {
  isLoadingFrozen.value = true
  try {
    const res = await api.get('/admin/users/frozen', { params: { page: frozenPage.value, search: frozenSearch.value || undefined } })
    if (res.data.success) { frozenUsers.value = res.data.data.users; frozenTotal.value = res.data.data.total }
  } catch {} finally { isLoadingFrozen.value = false }
}

const onFrozenSearch = () => {
  clearTimeout(frozenSearchDebounce)
  frozenSearchDebounce = setTimeout(() => { frozenPage.value = 1; fetchFrozenUsers() }, 300)
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
  if (!(await confirmDialog('Восстановить пользователя?'))) return
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
const postFilter = ref<'' | 'media' | 'nsfw' | 'announcement'>('')
const isLoadingPosts = ref(false)
let postSearchDebounce: ReturnType<typeof setTimeout>

const fetchPosts = async () => {
  isLoadingPosts.value = true
  try {
    const res = await api.get('/admin/posts', {
      params: { page: postPage.value, search: postSearch.value || undefined, filter: postFilter.value || undefined },
    })
    if (res.data.success) { posts.value = res.data.data.posts; postTotal.value = res.data.data.total }
  } catch {} finally { isLoadingPosts.value = false }
}

const onPostSearch = () => {
  clearTimeout(postSearchDebounce)
  postSearchDebounce = setTimeout(() => { postPage.value = 1; fetchPosts() }, 300)
}

const deletePost = async (postId: string) => {
  if (!(await confirmDialog('Удалить пост?', { danger: true }))) return
  try {
    await api.delete(`/admin/posts/${postId}`)
    posts.value = posts.value.filter(p => p.id !== postId)
  } catch {}
}

// "Pin" reuses the existing is_announcement flag as the admin feature/pin toggle.
const togglePostPin = async (post: any) => {
  try {
    const res = await api.patch(`/admin/posts/${post.id}/pin`)
    if (res.data.success) post.is_announcement = res.data.data.post.is_announcement
  } catch {}
}

// ── Reports ────────────────────────────────────────────────────────────
// `reports` holds "folders": one tile per (target_type, target_id), collapsing
// repeated complaints about the same post into a single card (grouped server-side).
const reports = ref<any[]>([])
const reportFilter = ref<'pending' | 'resolved' | 'dismissed' | ''>('')
const isLoadingReports = ref(false)
const expandedReportGroups = ref<Set<string>>(new Set())

const reportGroupKey = (folder: any) => `${folder.target_type}:${folder.target_id}`
const toggleReportGroup = (folder: any) => {
  const key = reportGroupKey(folder)
  if (expandedReportGroups.value.has(key)) expandedReportGroups.value.delete(key)
  else expandedReportGroups.value.add(key)
}

const fetchReports = async () => {
  isLoadingReports.value = true
  try {
    const res = await api.get('/admin/reports', { params: { status: reportFilter.value || undefined } })
    if (res.data.success) reports.value = res.data.data.reports
  } catch {} finally { isLoadingReports.value = false }
}

const resolveReportGroup = async (folder: any, status: 'resolved' | 'dismissed') => {
  try {
    const ids = folder.reports.filter((r: any) => r.status === 'pending').map((r: any) => r.id)
    if (!ids.length) return
    await api.patch('/admin/reports/resolve-batch', { ids, status })
    folder.status = status
    folder.reports.forEach((r: any) => { if (r.status === 'pending') r.status = status })
  } catch {}
}

// The only path that ever creates a warning from the reports queue — opens a modal
// where the moderator writes a reason (and optionally attaches evidence) before any
// content is removed or a warning is sent, so a warning is never issued without one.
const resolvingFolder = ref<any | null>(null)
const openResolveModal = (folder: any) => { resolvingFolder.value = folder }
const onFolderResolved = () => {
  if (!resolvingFolder.value) return
  const folder = resolvingFolder.value
  folder.status = 'resolved'
  folder.reports.forEach((r: any) => { if (r.status === 'pending') r.status = 'resolved' })
}

const REPORT_TARGET_LABEL: Record<string, string> = { post: 'Пост', group: 'Группа', listing: 'Лот', message: 'Сообщение', user: 'Профиль' }

// ── Warning appeals ────────────────────────────────────────────────────
const appeals = ref<any[]>([])
const isLoadingAppeals = ref(false)
const decidingAppealId = ref<string | null>(null)

const fetchAppeals = async () => {
  isLoadingAppeals.value = true
  try {
    const res = await api.get('/admin/appeals')
    if (res.data.success) appeals.value = res.data.data.appeals
  } catch {} finally { isLoadingAppeals.value = false }
}

const decideAppeal = async (logId: string, decision: 'accepted' | 'rejected') => {
  decidingAppealId.value = logId
  try {
    await api.patch(`/admin/appeals/${logId}`, { decision })
    appeals.value = appeals.value.filter((a: any) => a.id !== logId)
  } catch {} finally { decidingAppealId.value = null }
}

// ── Support tickets ──────────────────────────────────────────────────
const supportTickets = ref<any[]>([])
const supportFilter = ref<'' | 'open' | 'in_progress' | 'resolved' | 'closed'>('')
const isLoadingSupport = ref(false)
const supportReplyDrafts = ref<Record<string, string>>({})

const SUPPORT_TYPE_LABEL: Record<string, string> = { bug: 'Баг', feedback: 'Отзыв', question: 'Вопрос', other: 'Другое' }
const SUPPORT_STATUS_LABEL: Record<string, string> = { open: 'Открыт', in_progress: 'В работе', resolved: 'Решён', closed: 'Закрыт' }
const SUPPORT_STATUS_COLOR: Record<string, string> = { open: '#f59e0b', in_progress: '#38bdf8', resolved: '#10b981', closed: '#6b7280' }

const fetchSupportTickets = async () => {
  isLoadingSupport.value = true
  try {
    const res = await api.get('/support/admin/tickets', { params: { status: supportFilter.value || undefined } })
    if (res.data.success) supportTickets.value = res.data.data.tickets
  } catch {} finally { isLoadingSupport.value = false }
}

const replySupportTicket = async (ticketId: string, status?: string) => {
  const reply = supportReplyDrafts.value[ticketId]?.trim()
  try {
    const res = await api.patch(`/support/admin/tickets/${ticketId}`, {
      ...(status ? { status } : {}),
      ...(reply ? { admin_reply: reply } : {}),
    })
    if (res.data.success) {
      const idx = supportTickets.value.findIndex(t => t.id === ticketId)
      if (idx !== -1) supportTickets.value[idx] = { ...supportTickets.value[idx], ...res.data.data.ticket }
      delete supportReplyDrafts.value[ticketId]
    }
  } catch {}
}

// ── Ads ────────────────────────────────────────────────────────────────
const ads = ref<any[]>([])
const isLoadingAds = ref(false)
const newAd = ref({ title: '', description: '', linkUrl: '', imageUrl: '', priceLabel: '' })
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
      priceLabel: newAd.value.priceLabel || undefined,
    })
    if (res.data.success) {
      ads.value.unshift(res.data.data.ad)
      newAd.value = { title: '', description: '', linkUrl: '', imageUrl: '', priceLabel: '' }
      showAdForm.value = false
    }
  } catch {} finally { isSubmittingAd.value = false }
}

const deleteAd = async (adId: string) => {
  if (!(await confirmDialog('Удалить объявление?', { danger: true }))) return
  try {
    await api.delete(`/admin/ads/${adId}`)
    ads.value = ads.value.filter(a => a.id !== adId)
  } catch {}
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
const verFilter = ref('pending')
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

// `prompt()` cannot be called directly inside a template expression — Vue's compiler
// only resolves a small allowlist of browser globals there (window.prompt isn't in
// it), so a bare `prompt(...)` in `@click` silently resolves to `undefined` and
// "Отклонить" appeared to do nothing. Calling it from a plain script function works.
const rejectVerRequest = (id: string) => {
  const reason = window.prompt('Причина:') || undefined
  reviewVerRequest(id, 'reject', reason)
}

const evidenceLightbox = ref<{ images: string[]; start: number } | null>(null)
const openEvidenceLightbox = (images: string[], start: number) => { evidenceLightbox.value = { images, start } }

const postMediaLightbox = ref<{ images: string[]; start: number } | null>(null)
const openPostMediaLightbox = (images: string[], start: number) => { postMediaLightbox.value = { images, start } }

const verTypeLabels: Record<string, string> = {
  artist: 'Художник',
  master: 'Мастер',
  fursuiter: 'Фурсьютер',
  popular: 'Блогер',
  writer: 'Писатель',
  organizer: 'Организатор',
  event: 'Мероприятие',
  photographer: 'Фотограф',
  programmer: 'Программист',
}
const verTypeColors: Record<string, string> = {
  artist: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  master: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  fursuiter: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  popular: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  writer: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
  organizer: 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20',
  event: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  photographer: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
  programmer: 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20',
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
    frozenUsers.value = frozenUsers.value.filter(u => u.id !== userId)
    frozenTotal.value = Math.max(0, frozenTotal.value - 1)
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
    if (activeTab.value === 'frozen') await fetchFrozenUsers()
  } catch {}
}

const markDeceased = async (userId: string) => {
  const note = prompt('Заметка (необязательно):') ?? undefined
  try {
    await api.post(`/admin/users/${userId}/deceased`, { note: note || undefined })
    const u = users.value.find(u => u.id === userId)
    if (u) { u.deceased_at = new Date().toISOString(); u.deceased_note = note || null }
  } catch {}
}

const unmarkDeceased = async (userId: string) => {
  try {
    await api.post(`/admin/users/${userId}/undeceased`)
    const u = users.value.find(u => u.id === userId)
    if (u) { u.deceased_at = null; u.deceased_note = null }
  } catch {}
}

const clearUserWarns = async (userId: string) => {
  try {
    await api.post(`/admin/users/${userId}/clear-warns`)
    const u = users.value.find(u => u.id === userId)
    if (u) u.warn_count = 0
    const fu = frozenUsers.value.find(u => u.id === userId)
    if (fu) fu.warn_count = 0
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
    if (res.data.success) banners.value = res.data.data.banners
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
        if (idx !== -1) banners.value[idx] = res.data.data.banner
        showBannerForm.value = false
      }
    } else {
      const res = await api.post('/admin/sticker-banners', bannerForm.value)
      if (res.data.success) {
        banners.value.push(res.data.data.banner)
        showBannerForm.value = false
      }
    }
  } catch (e: any) {
    if (e?.response?.data?.code === 'LIMIT') bannerError.value = 'Достигнут лимит 7 баннеров'
    else bannerError.value = 'Ошибка сохранения'
  }
}

const deleteBanner = async (id: string) => {
  if (!(await confirmDialog('Удалить баннер?', { danger: true }))) return
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
      if (idx !== -1) banners.value[idx] = res.data.data.banner
    }
  } catch {}
}

// ── Statistics ────────────────────────────────────────────────────────
const stickerStats    = ref<any>(null)
const networkStats    = ref<any>(null)
const isLoadingStatistics = ref(false)
const statsSubTab = ref<'stickers' | 'network'>('stickers')

const fetchStatistics = async () => {
  if (stickerStats.value && networkStats.value) return
  isLoadingStatistics.value = true
  try {
    const [s, n] = await Promise.all([
      api.get('/admin/stats/stickers'),
      api.get('/admin/stats/network'),
    ])
    if (s.data.success)  stickerStats.value  = s.data.data
    if (n.data.success)  networkStats.value  = n.data.data
  } catch {} finally { isLoadingStatistics.value = false }
}

const barMax = (arr: { value: number }[]) => Math.max(...arr.map(x => x.value), 1)

// ── Groups & Events ─────────────────────────────────────────────────────
const groupsOverview = ref<any>(null)
const isLoadingGroupsOverview = ref(false)
const GROUP_TYPE_LABEL: Record<string, string> = {
  event: 'Афиша', creative: 'Мастерская', artist: 'Художник', static: 'Паблик',
  news: 'Новости', shop: 'Магазин', community: 'Сообщество', brand: 'Бренд',
}
const fetchGroupsOverview = async () => {
  if (groupsOverview.value) return
  isLoadingGroupsOverview.value = true
  try {
    const res = await api.get('/admin/groups-overview')
    if (res.data.success) groupsOverview.value = res.data.data
  } catch {} finally { isLoadingGroupsOverview.value = false }
}

// ── Finance & Premium ────────────────────────────────────────────────────
const premiumOverview = ref<any>(null)
const isLoadingPremiumOverview = ref(false)
const fetchPremiumOverview = async () => {
  if (premiumOverview.value) return
  isLoadingPremiumOverview.value = true
  try {
    const res = await api.get('/admin/premium-overview')
    if (res.data.success) premiumOverview.value = res.data.data
  } catch {} finally { isLoadingPremiumOverview.value = false }
}
const paidTierBreakdown = computed(() => {
  const rows = (premiumOverview.value?.byTier ?? []).filter((r: any) => r.tier !== 'free')
  const order: Record<string, number> = { business: 3, pro: 2, lite: 1 }
  return rows.sort((a: any, b: any) => (order[b.tier] ?? 0) - (order[a.tier] ?? 0))
})
const freeUserCount = computed(() => (premiumOverview.value?.byTier ?? []).find((r: any) => r.tier === 'free')?.count ?? 0)
const premiumShare = computed(() => {
  const total = premiumOverview.value?.total ?? 0
  return total ? Math.round(((total - freeUserCount.value) / total) * 100) : 0
})
const gmvMonths = computed(() => premiumOverview.value?.dealersDen?.gmvByMonth ?? [])
const gmvMax = computed(() => Math.max(...gmvMonths.value.map((m: any) => m.total), 1))

// ── Team & Roles ──────────────────────────────────────────────────────────
const staff = ref<any[]>([])
const isLoadingStaff = ref(false)
const showInviteForm = ref(false)
const inviteIdentifier = ref('')
const inviteRole = ref<'moderator' | 'admin' | 'owner'>('moderator')
const isInviting = ref(false)
const inviteError = ref('')

const fetchStaff = async () => {
  isLoadingStaff.value = true
  try {
    const res = await api.get('/admin/staff')
    if (res.data.success) staff.value = res.data.data.staff
  } catch {} finally { isLoadingStaff.value = false }
}

const inviteToStaff = async () => {
  if (!inviteIdentifier.value.trim()) return
  inviteError.value = ''
  isInviting.value = true
  try {
    const res = await api.post('/admin/staff', { identifier: inviteIdentifier.value.trim(), role: inviteRole.value })
    if (res.data.success) {
      staff.value = staff.value.filter(s => s.id !== res.data.data.user.id)
      staff.value.unshift(res.data.data.user)
      showInviteForm.value = false
      inviteIdentifier.value = ''
    }
  } catch (e: any) {
    inviteError.value = e?.response?.data?.error?.message || 'Пользователь не найден'
  } finally { isInviting.value = false }
}

const removeFromStaff = async (member: any) => {
  if (!(await confirmDialog(`Убрать ${member.display_name || member.username} из команды?`, { danger: true }))) return
  try {
    await api.patch(`/admin/users/${member.id}/role`, { role: 'user' })
    staff.value = staff.value.filter(s => s.id !== member.id)
  } catch {}
}

const suspendStaff = async (member: any) => {
  try {
    await api.post(`/admin/users/${member.id}/freeze`, { reason: 'Приостановлен модератором из панели управления командой' })
    const s = staff.value.find(s => s.id === member.id)
    if (s) s.frozen_at = new Date().toISOString()
  } catch {}
}

const reactivateStaff = async (member: any) => {
  try {
    await api.post(`/admin/users/${member.id}/unfreeze`)
    const s = staff.value.find(s => s.id === member.id)
    if (s) s.frozen_at = null
  } catch {}
}

const relativeLastSeen = (d: string | null) => {
  if (!d) return 'никогда'
  const diffMs = Date.now() - new Date(d).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'сейчас'
  if (min < 60) return `${min} мин назад`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs} ч назад`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} дн назад`
  return formatDate(d)
}

// ── Notifications / broadcasts ───────────────────────────────────────────
const broadcasts = ref<any[]>([])
const isLoadingBroadcasts = ref(false)
const broadcastTitle = ref('')
const broadcastBody = ref('')
const broadcastAudience = ref<'all' | 'premium' | 'new' | 'staff'>('all')
const isSendingBroadcast = ref(false)

const fetchBroadcasts = async () => {
  isLoadingBroadcasts.value = true
  try {
    const res = await api.get('/admin/broadcasts')
    if (res.data.success) broadcasts.value = res.data.data.broadcasts
  } catch {} finally { isLoadingBroadcasts.value = false }
}

const AUDIENCE_LABEL: Record<string, string> = { all: 'Все пользователи', premium: 'Premium-подписчики', new: 'Новые пользователи (7 дн.)', staff: 'Модераторы' }

const sendBroadcast = async () => {
  if (!broadcastTitle.value.trim() || !broadcastBody.value.trim() || isSendingBroadcast.value) return
  isSendingBroadcast.value = true
  try {
    const res = await api.post('/admin/broadcasts', { title: broadcastTitle.value.trim(), body: broadcastBody.value.trim(), audience: broadcastAudience.value })
    if (res.data.success) {
      broadcasts.value.unshift({ ...res.data.data.broadcast, opens: 0 })
      broadcastTitle.value = ''
      broadcastBody.value = ''
    }
  } catch {} finally { isSendingBroadcast.value = false }
}

// ── Logs & Settings ───────────────────────────────────────────────────────
const siteSettings = ref<Record<string, boolean> | null>(null)
const isLoadingSettings = ref(false)
const auditLogs = ref<any[]>([])
const isLoadingAuditLogs = ref(false)

const SETTING_META: { key: 'open_registration' | 'automod_enabled' | 'maintenance_mode'; label: string; desc: string }[] = [
  { key: 'open_registration', label: 'Открытая регистрация', desc: 'Разрешить новым пользователям создавать аккаунты' },
  { key: 'automod_enabled',   label: 'Автомодерация ИИ',     desc: 'Автоматическая проверка новых постов и историй' },
  { key: 'maintenance_mode',  label: 'Режим обслуживания',   desc: 'Временно закрыть доступ к платформе (кроме входа и админки)' },
]

const fetchSettingsAndLogs = async () => {
  isLoadingSettings.value = true
  isLoadingAuditLogs.value = true
  try {
    const [s, l] = await Promise.all([
      api.get('/admin/settings'),
      api.get('/admin/automod/logs', { params: { page: 1 } }),
    ])
    if (s.data.success) siteSettings.value = s.data.data.settings
    if (l.data.success) auditLogs.value = l.data.data.logs
  } catch {} finally { isLoadingSettings.value = false; isLoadingAuditLogs.value = false }
}

const toggleSetting = async (key: string) => {
  if (!siteSettings.value) return
  const next = !siteSettings.value[key]
  siteSettings.value[key] = next // optimistic
  try {
    const res = await api.patch('/admin/settings', { key, value: next })
    if (res.data.success) siteSettings.value = res.data.data.settings
    fetchSettingsAndLogs()
  } catch {
    siteSettings.value![key] = !next // revert
  }
}

const AUDIT_ACTION_ICON: Record<string, string> = {
  ban: 'Ban', unban: 'ShieldCheck', freeze: 'Snowflake', unfreeze: 'Unlock',
  warn: 'TriangleAlert', clear_warns: 'CheckCircle2', delete_post: 'Trash2',
  pin_post: 'Pin', unpin_post: 'Pin', role_change: 'UserCog', subscription_change: 'Sparkles',
  resolve_report: 'CheckCircle2', dismiss_report: 'X', approve_ad: 'Megaphone', reject_ad: 'Megaphone',
  activate_banner: 'Image', deactivate_banner: 'Image', settings_change: 'Settings',
  verify_profile: 'BadgeCheck', reject_verification: 'BadgeCheck',
}
const AUDIT_ACTION_LABEL: Record<string, (l: any) => string> = {
  ban: (l) => `забанил(а) пользователя @${l.user?.username}`,
  unban: (l) => `разбанил(а) пользователя @${l.user?.username}`,
  freeze: (l) => `заморозил(а) @${l.user?.username}`,
  unfreeze: (l) => `разморозил(а) @${l.user?.username}`,
  warn: (l) => `выдал(а) предупреждение @${l.user?.username}`,
  clear_warns: (l) => `сбросил(а) предупреждения @${l.user?.username}`,
  delete_post: (l) => `удалил(а) пост @${l.user?.username}`,
  pin_post: (l) => `закрепил(а) пост @${l.user?.username}`,
  unpin_post: (l) => `открепил(а) пост @${l.user?.username}`,
  role_change: (l) => `изменил(а) роль @${l.user?.username}`,
  subscription_change: (l) => `изменил(а) подписку @${l.user?.username}`,
  resolve_report: () => `решил(а) жалобы`,
  dismiss_report: () => `отклонил(а) жалобы`,
  approve_ad: () => `одобрил(а) рекламу`,
  reject_ad: () => `отклонил(а) рекламу`,
  activate_banner: () => `включил(а) баннер`,
  deactivate_banner: () => `скрыл(а) баннер`,
  settings_change: (l) => l.reason,
  verify_profile: (l) => `верифицировал(а) профиль @${l.user?.username}`,
  reject_verification: (l) => `отклонил(а) верификацию @${l.user?.username}`,
}
const auditActionText = (l: any) => (AUDIT_ACTION_LABEL[l.action] ?? (() => l.reason))(l)
const auditActorName = (l: any) => l.actor ? (l.actor.display_name || l.actor.username) : 'AutoMod'

// ── Infrastructure ────────────────────────────────────────────────────────
const infraOverview = ref<any>(null)
const isLoadingInfra = ref(false)
const fetchInfraOverview = async () => {
  if (infraOverview.value) return
  isLoadingInfra.value = true
  try {
    const res = await api.get('/admin/infra-overview')
    if (res.data.success) infraOverview.value = res.data.data
  } catch {} finally { isLoadingInfra.value = false }
}
const formatBytes = (bytes: number) => {
  if (!bytes) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}
const FOLDER_LABEL: Record<string, string> = {
  posts: 'Изображения постов', avatars: 'Аватары', banners: 'Баннеры', stickers: 'Стикеры',
  video: 'Видео', stories: 'Истории', other: 'Другое', messages: 'Вложения ЛС',
  backgrounds: 'Фоны профиля', fursona: 'Фото фурсоны', fursuit: 'Фото фурсьюта', comments: 'Вложения комментариев',
}

// ── Bloomly Updates ───────────────────────────────────────────────────────────
const updates = ref<any[]>([])
const isLoadingUpdates = ref(false)
const newUpdateTitle = ref('')
const newUpdateBody = ref('')
const newUpdateImageUrl = ref('')
const isSavingUpdate = ref(false)

const fetchUpdates = async () => {
  isLoadingUpdates.value = true
  try {
    const res = await api.get('/updates/all')
    if (res.data.success) updates.value = res.data.data.updates
  } catch {} finally { isLoadingUpdates.value = false }
}

const createUpdate = async () => {
  if (!newUpdateTitle.value.trim() || isSavingUpdate.value) return
  isSavingUpdate.value = true
  try {
    const res = await api.post('/updates', {
      title: newUpdateTitle.value.trim(),
      body: newUpdateBody.value.trim() || undefined,
      image_url: newUpdateImageUrl.value.trim() || undefined,
    })
    if (res.data.success) {
      updates.value.unshift(res.data.data.update)
      newUpdateTitle.value = ''
      newUpdateBody.value = ''
      newUpdateImageUrl.value = ''
    }
  } catch {} finally { isSavingUpdate.value = false }
}

const deleteUpdate = async (id: string) => {
  if (!(await confirmDialog('Удалить обновление?', { danger: true }))) return
  try {
    await api.delete(`/updates/${id}`)
    updates.value = updates.value.filter(u => u.id !== id)
  } catch {}
}

const toggleUpdate = async (id: string, is_active: boolean) => {
  try {
    const res = await api.patch(`/updates/${id}/toggle`, { is_active })
    if (res.data.success) {
      const u = updates.value.find(u => u.id === id)
      if (u) u.is_active = res.data.data.update.is_active
    }
  } catch {}
}

// Tab switch data loading
const switchTab = (tab: typeof activeTab.value) => {
  activeTab.value = tab
  if (tab === 'users' && !users.value.length) fetchUsers()
  if (tab === 'frozen' && !frozenUsers.value.length) fetchFrozenUsers()
  if (tab === 'archived' && !archivedUsers.value.length) fetchArchivedUsers()
  if (tab === 'posts' && !posts.value.length) fetchPosts()
  if (tab === 'reports' && !reports.value.length) fetchReports()
  if (tab === 'appeals' && !appeals.value.length) fetchAppeals()
  if (tab === 'support' && !supportTickets.value.length) fetchSupportTickets()
  if (tab === 'ads' && !ads.value.length) fetchAds()
  if (tab === 'verification' && !verRequests.value.length) fetchVerRequests()
  if (tab === 'banners' && !banners.value.length) fetchBanners()
  if (tab === 'automod') fetchAutoModLogs()
  if (tab === 'statistics') fetchStatistics()
  if (tab === 'updates' && !updates.value.length) fetchUpdates()
  if (tab === 'groups') fetchGroupsOverview()
  if (tab === 'finance') fetchPremiumOverview()
  if (tab === 'team' && !staff.value.length) fetchStaff()
  if (tab === 'broadcasts') fetchBroadcasts()
  if (tab === 'settings') fetchSettingsAndLogs()
  if (tab === 'infra') fetchInfraOverview()
}

const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const formatDate = (d: string) => new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })

const navItems = computed(() => [
  { tab: 'overview'     as const, label: 'Обзор',           icon: 'LayoutDashboard', color: '#4C67CF', group: null,          badge: null, minRole: 'moderator' },
  { tab: 'users'        as const, label: 'Пользователи',   icon: 'Users',           color: '#94a3b8', group: 'МОДЕРАЦИЯ',   badge: userTotal.value > 0 ? formatNum(userTotal.value) : null, minRole: 'moderator' },
  { tab: 'frozen'       as const, label: 'Заморожены',      icon: 'Snowflake',       color: '#38bdf8', group: 'МОДЕРАЦИЯ',   badge: frozenTotal.value > 0 ? String(frozenTotal.value) : null, minRole: 'moderator' },
  { tab: 'archived'     as const, label: 'Забанены',        icon: 'Ban',             color: '#f43f5e', group: 'МОДЕРАЦИЯ',   badge: archivedTotal.value > 0 ? String(archivedTotal.value) : null, minRole: 'moderator' },
  { tab: 'reports'      as const, label: 'Жалобы',          icon: 'Flag',            color: '#f59e0b', group: 'МОДЕРАЦИЯ',   badge: reports.value.filter((r:any) => r.status==='pending').length || null, minRole: 'moderator' },
  { tab: 'appeals'      as const, label: 'Апелляции',       icon: 'Gavel',           color: '#a78bfa', group: 'МОДЕРАЦИЯ',   badge: appeals.value.length > 0 ? String(appeals.value.length) : null, minRole: 'moderator' },
  { tab: 'support'      as const, label: 'Поддержка',       icon: 'LifeBuoy',        color: '#4C67CF', group: 'МОДЕРАЦИЯ',   badge: supportTickets.value.filter((t:any) => t.status==='open').length || null, minRole: 'moderator' },
  { tab: 'automod'      as const, label: 'AutoMod',          icon: 'ShieldAlert',     color: '#ef4444', group: 'МОДЕРАЦИЯ',   badge: autoModTotal.value > 0 ? formatNum(autoModTotal.value) : null, minRole: 'moderator' },
  { tab: 'posts'        as const, label: 'Посты',           icon: 'FileText',        color: '#94a3b8', group: 'КОНТЕНТ',     badge: null, minRole: 'moderator' },
  { tab: 'verification' as const, label: 'Верификация',     icon: 'BadgeCheck',      color: '#2dd4bf', group: 'КОНТЕНТ',     badge: verRequests.value.filter((r:any) => r.status==='pending').length || null, minRole: 'moderator' },
  { tab: 'ads'          as const, label: 'Реклама',         icon: 'Megaphone',       color: '#f97316', group: 'КОНТЕНТ',     badge: ads.value.filter((a:any) => a.status==='pending').length || null, minRole: 'admin' },
  { tab: 'banners'      as const, label: 'Баннеры',         icon: 'Image',           color: '#a78bfa', group: 'КОНТЕНТ',     badge: null, minRole: 'admin' },
  { tab: 'updates'      as const, label: 'Обновления',       icon: 'Sparkles',        color: '#4C67CF', group: 'КОНТЕНТ',     badge: updates.value.filter((u:any) => u.is_active).length || null, minRole: 'admin' },
  { tab: 'groups'       as const, label: 'Группы и события', icon: 'LayoutGrid',      color: '#4C67CF', group: 'ПЛАТФОРМА',   badge: null, minRole: 'moderator' },
  { tab: 'finance'      as const, label: 'Финансы и Premium', icon: 'Wallet',         color: '#a78bfa', group: 'ПЛАТФОРМА',   badge: null, minRole: 'admin' },
  { tab: 'broadcasts'   as const, label: 'Уведомления',      icon: 'Send',            color: '#4C67CF', group: 'ПЛАТФОРМА',   badge: null, minRole: 'admin' },
  { tab: 'infra'        as const, label: 'Инфраструктура',   icon: 'Server',          color: '#10b981', group: 'ПЛАТФОРМА',   badge: null, minRole: 'admin' },
  { tab: 'team'         as const, label: 'Команда и роли',   icon: 'ShieldCheck',     color: '#f59e0b', group: 'ПЛАТФОРМА',   badge: null, minRole: 'admin' },
  { tab: 'settings'     as const, label: 'Логи и настройки', icon: 'Settings',        color: '#94a3b8', group: 'ПЛАТФОРМА',   badge: null, minRole: 'admin' },
  { tab: 'statistics'   as const, label: 'Статистика',       icon: 'BarChart2',       color: '#10b981', group: 'АНАЛИТИКА',   badge: null, minRole: 'admin' },
].filter(item => myRoleRank.value >= ROLE_RANK[item.minRole]))

const navGroups = computed(() => {
  const groups: { label: string | null; items: typeof navItems.value }[] = []
  for (const item of navItems.value) {
    let g = groups.find(g => g.label === item.group)
    if (!g) { g = { label: item.group, items: [] }; groups.push(g) }
    g.items.push(item)
  }
  return groups
})

const statCards = computed(() => stats.value ? [
  { label: 'Всего пользователей', icon: 'Users',       color: '#4C67CF', value: formatNum(stats.value.users.total),          sub: `+${stats.value.users.today} сегодня` },
  { label: 'Новых сегодня',       icon: 'UserPlus',    color: '#10b981', value: formatNum(stats.value.users.today),          sub: `+${stats.value.users.week} за неделю` },
  { label: 'С подпиской',         icon: 'Sparkles',    color: '#a78bfa', value: formatNum(stats.value.premiumSubscribers),   sub: `из ${formatNum(stats.value.users.total)} пользователей` },
  { label: 'Постов всего',        icon: 'FileText',    color: '#22d3ee', value: formatNum(stats.value.posts.total),          sub: `+${stats.value.posts.week} за неделю` },
  { label: 'Постов сегодня',      icon: 'FilePlus2',   color: '#f59e0b', value: formatNum(stats.value.posts.today),          sub: 'публикаций' },
  { label: 'Жалоб в очереди',     icon: 'Flag',        color: '#f43f5e', value: formatNum(stats.value.moderation.pendingReports), sub: 'ожидают рассмотрения' },
] : [])

// ── Growth charts — cumulative totals reconstructed from last-12-months deltas
const formatMonthShort = (d: string | Date) => new Date(d).toLocaleDateString('ru-RU', { month: 'short' })

const buildCumulative = (rows: { month: string; count: number }[] | undefined, endTotal: number) => {
  if (!rows?.length) return []
  const sum = rows.reduce((s, r) => s + r.count, 0)
  let running = endTotal - sum
  return rows.map(r => { running += r.count; return { month: r.month, total: running } })
}
const userGrowthSeries = computed(() => buildCumulative(stats.value?.userGrowth, stats.value?.users.total ?? 0))
const postGrowthSeries = computed(() => buildCumulative(stats.value?.postGrowth, stats.value?.posts.total ?? 0))
const userGrowthMax = computed(() => Math.max(...userGrowthSeries.value.map(p => p.total), 1))
const userGrowthMin = computed(() => Math.min(...userGrowthSeries.value.map(p => p.total), userGrowthMax.value))
const postGrowthMax = computed(() => Math.max(...postGrowthSeries.value.map(p => p.total), 1))
const postGrowthMin = computed(() => Math.min(...postGrowthSeries.value.map(p => p.total), postGrowthMax.value))

// SVG polyline points for a simple area/line chart, normalised into a 0..300 x 0..100 viewBox
const buildLineCoords = (series: { month: string; total: number }[], min: number, max: number) => {
  if (series.length < 2) return []
  const range = Math.max(max - min, 1)
  return series.map((p, i) => {
    const x = (i / (series.length - 1)) * 300
    const y = 100 - ((p.total - min) / range) * 92 - 4
    return { x, y, month: p.month, total: p.total }
  })
}
const userGrowthCoords = computed(() => buildLineCoords(userGrowthSeries.value, userGrowthMin.value, userGrowthMax.value))
const postGrowthCoords = computed(() => buildLineCoords(postGrowthSeries.value, postGrowthMin.value, postGrowthMax.value))
const userGrowthPoints = computed(() => userGrowthCoords.value.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '))
const postGrowthPoints = computed(() => postGrowthCoords.value.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '))

const hoveredGrowthPoint = ref<{ chart: 'users' | 'posts'; index: number } | null>(null)
const activeGrowthTooltip = computed(() => {
  if (!hoveredGrowthPoint.value) return null
  const { chart, index } = hoveredGrowthPoint.value
  const coord = (chart === 'users' ? userGrowthCoords.value : postGrowthCoords.value)[index]
  if (!coord) return null
  return { left: (coord.x / 300) * 100, top: coord.y, month: coord.month, total: coord.total }
})

const hoveredActivityBar = ref<{ row: string; index: number } | null>(null)
const formatWeekday = (d: string) => {
  const label = new Date(d).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// ── Weekly activity — posts / likes / comments per day, last 7 days
const weeklyActivityRows = computed(() => {
  const wa = stats.value?.weeklyActivity
  if (!wa) return []
  const rows = [
    { label: 'Посты',        color: '#4C67CF', days: wa.posts },
    { label: 'Лайки',        color: '#f7a9e2', days: wa.likes },
    { label: 'Комментарии',  color: '#cd83f5', days: wa.comments },
  ]
  return rows.map(r => ({
    ...r,
    total: r.days.reduce((s: number, d: any) => s + d.count, 0),
    max: Math.max(...r.days.map((d: any) => d.count), 1),
  }))
})

// ── Geography — top countries by user count (from /admin/stats/network)
const topCountries = computed(() => {
  const rows = (networkStats.value?.usersByCountry ?? []).filter((r: any) => r.label && r.label !== 'null')
  const total = rows.reduce((s: number, r: any) => s + r.value, 0) || 1
  return rows.slice(0, 5).map((r: any) => ({ ...r, pct: Math.round((r.value / total) * 100) }))
})

// ── Reports by AutoMod category
const REPORT_CATEGORY_LABEL: Record<string, string> = {
  spam: 'Спам', toxic: 'Токсичность', duplicate: 'Дубликаты', fraud: 'Мошенничество',
  suspicious: 'Подозрительное', manual: 'Проверено вручную', other: 'Другое',
}
const topReportCategories = computed(() => {
  const rows = stats.value?.reportsByCategory ?? []
  const max = Math.max(...rows.map((r: any) => r.count), 1)
  return rows.slice(0, 5).map((r: any) => ({ ...r, label: REPORT_CATEGORY_LABEL[r.category] ?? r.category, pct: Math.round((r.count / max) * 100) }))
})

// Moderation snapshot — the things staff act on first (freezes, bans, reports, automod)
const modSnapshot = computed(() => stats.value ? [
  { tab: 'reports'      as const, label: 'Жалобы в очереди', icon: 'Flag',        color: '#f59e0b', value: stats.value.moderation.pendingReports },
  { tab: 'frozen'       as const, label: 'Заморожены',       icon: 'Snowflake',   color: '#38bdf8', value: stats.value.moderation.frozenUsers },
  { tab: 'automod'      as const, label: 'AutoMod за 24ч',    icon: 'ShieldAlert', color: '#ef4444', value: stats.value.moderation.autoModFlags24h },
  { tab: 'verification' as const, label: 'Верификация',      icon: 'BadgeCheck',  color: '#2dd4bf', value: stats.value.moderation.pendingVerification },
] : [])

const roleColor = (role: string) => ({ owner: '#eab308', admin: '#f97316', moderator: '#4C67CF', user: '#64748b' }[role] ?? '#64748b')

const tabTitle: Record<string, string> = {
  overview: 'Обзор платформы',
  infra: 'Инфраструктура и контент',
  settings: 'Логи и настройки системы',
}

const tabSubtitle: Record<string, string> = {
  overview: 'Ключевые метрики Bloomly за последние 30 дней',
  users: 'Все зарегистрированные аккаунты платформы',
  frozen: 'Аккаунты, временно ограниченные автомодерацией или вручную',
  archived: 'Забаненные и удалённые аккаунты',
  posts: 'Последние публикации сообщества',
  reports: 'Жалобы, NSFW-метки и очередь на рассмотрение',
  support: 'Обращения пользователей в поддержку',
  ads: 'Размещения рекламы на платформе',
  verification: 'Заявки на получение бейджа верификации',
  banners: 'Промо-баннеры карусели стикеров',
  automod: 'Журнал действий автоматической модерации',
  statistics: 'Стикеры и сеть — агрегированная аналитика',
  updates: 'Публичный список изменений Bloomly',
  groups: 'Сообщества и мероприятия платформы',
  finance: 'Подписки Premium — тарифы и подписчики',
  broadcasts: 'Отправка сообщений всей аудитории или сегментам',
  infra: 'Стикеры, Dealers\' Den и реальное использование хранилища S3',
  team: 'Администраторы, модераторы и их роли',
  settings: 'Переключатели платформы и журнал действий администраторов',
}

// ── Header search — jumps into Users with the query pre-filled ─────────
const headerSearch = ref('')
const runHeaderSearch = () => {
  const q = headerSearch.value.trim()
  if (!q) return
  userSearch.value = q
  switchTab('users')
  userPage.value = 1
  fetchUsers()
}

// ── Bell badge — total items actually waiting on staff review ──────────
const totalPendingBadge = computed(() => {
  if (!stats.value) return 0
  return stats.value.moderation.pendingReports
    + stats.value.moderation.pendingVerification
    + stats.value.moderation.pendingAds
    + supportTickets.value.filter((t: any) => t.status === 'open').length
})
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito flex relative isolate">

    <!-- ═══════════════════ SIDEBAR ═══════════════════════════════════════ -->
    <aside class="w-64 flex-shrink-0 hidden md:flex flex-col fixed top-0 left-0 h-full z-30
      bg-brand-card border-r border-brand-border">

      <!-- Logo -->
      <div class="px-5 pt-6 pb-5 border-b border-brand-border">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center bg-brand-accent flex-shrink-0">
            <BIcon name="Flower2" class="w-4.5 h-4.5 text-white" />
          </div>
          <p class="font-extrabold text-white text-base leading-none">Bloomly</p>
          <span class="text-[10px] font-extrabold px-2 py-1 rounded-full bg-brand-accent/15 text-brand-accent border border-brand-accent/25 tracking-[0.1em]">ADMIN</span>
        </div>
      </div>

      <!-- Nav items -->
      <nav class="flex-1 px-3 py-4 space-y-4 overflow-y-auto adm-scroll">
        <div v-for="group in navGroups" :key="group.label ?? 'root'" class="space-y-0.5">
          <p v-if="group.label" class="px-3 mb-1.5 text-[10px] font-extrabold text-white/25 tracking-[0.15em] uppercase">{{ group.label }}</p>
          <button v-for="item in group.items" :key="item.tab" @click="switchTab(item.tab)"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 group relative"
            :class="activeTab === item.tab
              ? 'text-white bg-brand-accent/15'
              : 'text-white/50 hover:text-white/80 hover:bg-white/5'">
            <!-- Icon -->
            <div class="relative w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200"
              :class="activeTab === item.tab ? 'bg-brand-accent/25' : 'group-hover:bg-white/5'">
              <BIcon :name="item.icon" class="w-3.5 h-3.5 transition-all duration-200" :class="activeTab === item.tab ? 'text-brand-accent' : ''" />
            </div>
            <span class="relative flex-1 text-left text-[13px]">{{ item.label }}</span>
            <!-- Badge for pending counts -->
            <span v-if="item.badge" class="relative text-[10px] font-extrabold px-1.5 py-0.5 rounded-full"
              :style="`background:${item.color}22;color:${item.color}`">
              {{ item.badge }}
            </span>
          </button>
        </div>
      </nav>

      <!-- Footer -->
      <div class="p-3 border-t border-brand-border">
        <button @click="router.push({ name: 'home' })"
          class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-all group">
          <BIcon name="ArrowLeft" class="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" /> На главную
        </button>
      </div>
    </aside>

    <!-- ═══════════════════ MAIN CONTENT ══════════════════════════════════ -->
    <div class="flex-1 md:ml-64 min-h-screen flex flex-col">

      <!-- Top bar -->
      <header class="adm-header sticky top-0 z-20 bg-brand-bg/95 backdrop-blur-xl border-b border-brand-border px-6 py-3.5 flex items-center gap-4">
        <!-- Search -->
        <div class="relative flex-1 max-w-xl">
          <BIcon name="Search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input v-model="headerSearch" @keyup.enter="runHeaderSearch" type="text"
            placeholder="Поиск пользователей, постов, жалоб…"
            class="w-full bg-brand-bg border border-brand-border rounded-2xl pl-11 pr-4 py-2.5 text-sm text-white placeholder-white/25
              outline-none focus:border-brand-accent/50 transition-all" />
        </div>

        <!-- Mobile nav -->
        <div class="flex md:hidden gap-1 overflow-x-auto">
          <button v-for="item in navItems" :key="item.tab" @click="switchTab(item.tab)"
            :class="activeTab === item.tab ? 'bg-brand-accent/20 text-brand-accent border-brand-accent/30' : 'text-white/40 border-brand-border'"
            class="w-9 h-9 flex-shrink-0 rounded-xl border flex items-center justify-center transition-all">
            <BIcon :name="item.icon" class="w-4 h-4" />
          </button>
        </div>

        <!-- Bell -->
        <button title="Ожидают рассмотрения" class="relative hidden md:flex w-9 h-9 rounded-xl bg-brand-bg border border-brand-border items-center justify-center text-white/50 hover:text-white transition-all flex-shrink-0">
          <BIcon name="Bell" class="w-4 h-4" />
          <span v-if="totalPendingBadge > 0" class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand-error text-white text-[9px] font-extrabold flex items-center justify-center">
            {{ totalPendingBadge > 99 ? '99+' : totalPendingBadge }}
          </span>
        </button>

        <!-- My identity -->
        <div class="hidden md:flex items-center gap-2.5 pl-3 border-l border-brand-border flex-shrink-0">
          <img v-if="auth.user?.avatar_url" :src="auth.user.avatar_url" class="w-9 h-9 rounded-xl object-cover border border-brand-border flex-shrink-0" />
          <div v-else class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0"
            :style="`background:${roleColor(myRole)}20;color:${roleColor(myRole)}`">
            {{ ((auth.user as any)?.display_name || (auth.user as any)?.username || '?')[0].toUpperCase() }}
          </div>
          <div class="min-w-0">
            <p class="text-xs font-bold text-white truncate">{{ (auth.user as any)?.display_name || (auth.user as any)?.username }}</p>
            <p class="text-[10px] font-bold" :style="`color:${roleColor(myRole)}`">{{ roleLabel(myRole) }}</p>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 p-6 max-w-5xl mx-auto w-full">
      <div class="mb-6">
        <h1 class="text-2xl font-black text-white">{{ tabTitle[activeTab] ?? navItems.find(i=>i.tab===activeTab)?.label }}</h1>
        <p class="text-sm text-white/40 mt-0.5">{{ tabSubtitle[activeTab] }}</p>
      </div>
      <Transition name="tab-fade" mode="out-in">
      <div :key="activeTab">

        <!-- ── OVERVIEW ─────────────────────────────────────────────── -->
        <div v-if="activeTab === 'overview'">
          <!-- Skeleton -->
          <div v-if="isLoadingStats" class="space-y-5">
            <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div v-for="n in 6" :key="n" class="h-28 rounded-2xl bg-white/5 animate-pulse" />
            </div>
            <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
          </div>

          <template v-else-if="stats">
            <!-- Moderation snapshot — the queue staff actually work from -->
            <div class="flex items-center gap-2 mb-3">
              <span class="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
              <h2 class="text-xs font-extrabold text-white/50 tracking-[0.15em] uppercase">Требует внимания</h2>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              <button v-for="mc in modSnapshot" :key="mc.label" @click="switchTab(mc.tab)"
                class="relative text-left rounded-2xl p-4 overflow-hidden border transition-all duration-200 group hover:-translate-y-0.5 hover:shadow-lg"
                :style="`background:${mc.color}0d;border-color:${mc.color}25`">
                <div class="flex items-center justify-between mb-2.5">
                  <div class="w-8 h-8 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110" :style="`background:${mc.color}20`">
                    <BIcon :name="mc.icon" class="w-4 h-4" :style="`color:${mc.color}`" />
                  </div>
                  <BIcon name="ArrowUpRight" class="w-3.5 h-3.5 text-white/20 group-hover:text-white/50 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </div>
                <p class="text-2xl font-black text-white">{{ mc.value }}</p>
                <p class="text-xs text-white/45 mt-0.5 font-semibold">{{ mc.label }}</p>
              </button>
            </div>

            <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">Общая статистика</h2>
            <!-- Stat cards -->
            <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
              <div v-for="sc in statCards" :key="sc.label"
                class="relative rounded-2xl p-4 border border-brand-border bg-brand-card hover:border-white/20 transition-all duration-200">
                <div class="flex items-center justify-between mb-3">
                  <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ sc.label }}</p>
                  <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" :style="`background:${sc.color}20`">
                    <BIcon :name="sc.icon" class="w-3.5 h-3.5" :style="`color:${sc.color}`" />
                  </div>
                </div>
                <p class="text-2xl font-black text-white">{{ sc.value }}</p>
                <p class="text-xs font-semibold mt-1" :style="`color:${sc.color}`">{{ sc.sub }}</p>
              </div>
            </div>

            <!-- Growth charts -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm">Рост пользователей</h3>
                <p class="text-xs text-white/40 mt-0.5 mb-4">Всего зарегистрировано, по месяцам</p>
                <div class="relative">
                  <div v-if="activeGrowthTooltip && hoveredGrowthPoint?.chart === 'users'"
                    class="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none flex flex-col items-center"
                    :style="`left:${activeGrowthTooltip.left}%;top:${activeGrowthTooltip.top}%;margin-top:-10px`">
                    <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0B1030]/95 backdrop-blur-sm border border-[#4C67CF]/30 shadow-lg shadow-black/40 whitespace-nowrap">
                      <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:#4C67CF" />
                      <div class="leading-tight">
                        <p class="text-[9px] text-white/45 font-semibold capitalize">{{ formatMonthShort(activeGrowthTooltip.month) }}</p>
                        <p class="text-xs font-black text-white">{{ formatNum(activeGrowthTooltip.total) }}</p>
                      </div>
                    </div>
                    <div class="w-2 h-2 rotate-45 -mt-1 bg-[#0B1030]/95 border-r border-b border-[#4C67CF]/30" />
                  </div>
                  <svg viewBox="0 0 300 100" preserveAspectRatio="none" class="w-full h-32">
                    <polygon v-if="userGrowthPoints" :points="`0,100 ${userGrowthPoints} 300,100`" fill="url(#ov-grad-users)" />
                    <polyline v-if="userGrowthPoints" :points="userGrowthPoints" fill="none" stroke="#4C67CF" stroke-width="2" vector-effect="non-scaling-stroke" />
                    <defs>
                      <linearGradient id="ov-grad-users" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#4C67CF" stop-opacity="0.35" />
                        <stop offset="100%" stop-color="#4C67CF" stop-opacity="0" />
                      </linearGradient>
                    </defs>
                    <line v-for="gy in [22, 50, 78]" :key="gy" x1="0" x2="300" :y1="gy" :y2="gy" stroke="white" stroke-opacity="0.06" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <line v-if="hoveredGrowthPoint?.chart === 'users'" :x1="userGrowthCoords[hoveredGrowthPoint.index]?.x" :x2="userGrowthCoords[hoveredGrowthPoint.index]?.x"
                      y1="4" y2="100" stroke="#4C67CF" stroke-width="1" stroke-dasharray="3,3" opacity="0.3" vector-effect="non-scaling-stroke" />
                    <g v-for="(c, i) in userGrowthCoords" :key="i">
                      <circle v-if="hoveredGrowthPoint?.chart === 'users' && hoveredGrowthPoint?.index === i"
                        :cx="c.x" :cy="c.y" r="6" fill="#4C67CF" opacity="0.2" />
                      <circle :cx="c.x" :cy="c.y" :r="hoveredGrowthPoint?.chart === 'users' && hoveredGrowthPoint?.index === i ? 3 : 2.25"
                        fill="#4C67CF" stroke="#0B1030" stroke-width="1.5" vector-effect="non-scaling-stroke" class="transition-all" />
                      <circle :cx="c.x" :cy="c.y" r="8" fill="transparent" class="cursor-pointer"
                        @mouseenter="hoveredGrowthPoint = { chart: 'users', index: i }"
                        @mouseleave="hoveredGrowthPoint = null" />
                    </g>
                  </svg>
                </div>
                <div class="flex justify-between mt-1">
                  <span v-for="(p, i) in userGrowthSeries" :key="i" class="text-[9px] text-white/25" :class="i % 2 === 1 ? 'hidden sm:inline' : ''">{{ formatMonthShort(p.month) }}</span>
                </div>
              </div>
              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm">Рост публикаций</h3>
                <p class="text-xs text-white/40 mt-0.5 mb-4">Всего постов, по месяцам</p>
                <div class="relative">
                  <div v-if="activeGrowthTooltip && hoveredGrowthPoint?.chart === 'posts'"
                    class="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none flex flex-col items-center"
                    :style="`left:${activeGrowthTooltip.left}%;top:${activeGrowthTooltip.top}%;margin-top:-10px`">
                    <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0B1030]/95 backdrop-blur-sm border border-[#66C770]/30 shadow-lg shadow-black/40 whitespace-nowrap">
                      <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" style="background:#66C770" />
                      <div class="leading-tight">
                        <p class="text-[9px] text-white/45 font-semibold capitalize">{{ formatMonthShort(activeGrowthTooltip.month) }}</p>
                        <p class="text-xs font-black text-white">{{ formatNum(activeGrowthTooltip.total) }}</p>
                      </div>
                    </div>
                    <div class="w-2 h-2 rotate-45 -mt-1 bg-[#0B1030]/95 border-r border-b border-[#66C770]/30" />
                  </div>
                  <svg viewBox="0 0 300 100" preserveAspectRatio="none" class="w-full h-32">
                    <polygon v-if="postGrowthPoints" :points="`0,100 ${postGrowthPoints} 300,100`" fill="url(#ov-grad-posts)" />
                    <polyline v-if="postGrowthPoints" :points="postGrowthPoints" fill="none" stroke="#66C770" stroke-width="2" vector-effect="non-scaling-stroke" />
                    <defs>
                      <linearGradient id="ov-grad-posts" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#66C770" stop-opacity="0.35" />
                        <stop offset="100%" stop-color="#66C770" stop-opacity="0" />
                      </linearGradient>
                    </defs>
                    <line v-for="gy in [22, 50, 78]" :key="gy" x1="0" x2="300" :y1="gy" :y2="gy" stroke="white" stroke-opacity="0.06" stroke-width="1" vector-effect="non-scaling-stroke" />
                    <line v-if="hoveredGrowthPoint?.chart === 'posts'" :x1="postGrowthCoords[hoveredGrowthPoint.index]?.x" :x2="postGrowthCoords[hoveredGrowthPoint.index]?.x"
                      y1="4" y2="100" stroke="#66C770" stroke-width="1" stroke-dasharray="3,3" opacity="0.3" vector-effect="non-scaling-stroke" />
                    <g v-for="(c, i) in postGrowthCoords" :key="i">
                      <circle v-if="hoveredGrowthPoint?.chart === 'posts' && hoveredGrowthPoint?.index === i"
                        :cx="c.x" :cy="c.y" r="6" fill="#66C770" opacity="0.2" />
                      <circle :cx="c.x" :cy="c.y" :r="hoveredGrowthPoint?.chart === 'posts' && hoveredGrowthPoint?.index === i ? 3 : 2.25"
                        fill="#66C770" stroke="#0B1030" stroke-width="1.5" vector-effect="non-scaling-stroke" class="transition-all" />
                      <circle :cx="c.x" :cy="c.y" r="8" fill="transparent" class="cursor-pointer"
                        @mouseenter="hoveredGrowthPoint = { chart: 'posts', index: i }"
                        @mouseleave="hoveredGrowthPoint = null" />
                    </g>
                  </svg>
                </div>
                <div class="flex justify-between mt-1">
                  <span v-for="(p, i) in postGrowthSeries" :key="i" class="text-[9px] text-white/25" :class="i % 2 === 1 ? 'hidden sm:inline' : ''">{{ formatMonthShort(p.month) }}</span>
                </div>
              </div>
            </div>

            <!-- Weekly activity / geography / reports breakdown -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">Активность за неделю</h3>
                <div v-for="row in weeklyActivityRows" :key="row.label" class="mb-5 last:mb-0">
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-xs font-semibold text-white/60">{{ row.label }}</span>
                    <span class="text-sm font-black text-white">{{ formatNum(row.total) }}</span>
                  </div>
                  <div class="relative flex items-end gap-1 h-10">
                    <div v-if="hoveredActivityBar?.row === row.label"
                      class="absolute z-10 -translate-x-1/2 -translate-y-full pointer-events-none flex flex-col items-center"
                      :style="`left:${((hoveredActivityBar.index + 0.5) / row.days.length) * 100}%;bottom:calc(${Math.max(6, (row.days[hoveredActivityBar.index].count / row.max) * 100)}% + 8px)`">
                      <div class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0B1030]/95 backdrop-blur-sm border shadow-lg shadow-black/40 whitespace-nowrap"
                        :style="`border-color:${row.color}4d`">
                        <span class="w-1.5 h-1.5 rounded-full flex-shrink-0" :style="`background:${row.color}`" />
                        <div class="leading-tight">
                          <p class="text-[9px] text-white/45 font-semibold">{{ formatWeekday(row.days[hoveredActivityBar.index].day) }}</p>
                          <p class="text-xs font-black text-white">{{ formatNum(row.days[hoveredActivityBar.index].count) }}</p>
                        </div>
                      </div>
                      <div class="w-2 h-2 rotate-45 -mt-1 bg-[#0B1030]/95 border-r border-b" :style="`border-color:${row.color}4d`" />
                    </div>
                    <div v-for="(d, i) in row.days" :key="i" class="relative flex-1 h-full flex items-end cursor-pointer"
                      @mouseenter="hoveredActivityBar = { row: row.label, index: i }"
                      @mouseleave="hoveredActivityBar = null">
                      <div class="w-full rounded-t-md transition-all duration-150"
                        :style="`height:${Math.max(6, (d.count / row.max) * 100)}%;background:${row.color};opacity:${!hoveredActivityBar || hoveredActivityBar.row !== row.label || hoveredActivityBar.index === i ? 1 : 0.35}`" />
                    </div>
                  </div>
                </div>
                <p v-if="!weeklyActivityRows.length" class="text-xs text-white/25 text-center py-6">Нет данных</p>
              </div>

              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">География пользователей</h3>
                <div v-for="c in topCountries" :key="c.label" class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-semibold text-white/60">{{ c.label }}</span>
                    <span class="text-xs font-bold text-white">{{ c.pct }}%</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full bg-brand-accent" :style="`width:${c.pct}%`" />
                  </div>
                </div>
                <p v-if="!topCountries.length" class="text-xs text-white/25 text-center py-6">Нет данных</p>
              </div>

              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">Жалобы по категориям</h3>
                <div v-for="r in topReportCategories" :key="r.category" class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-semibold text-white/60">{{ r.label }}</span>
                    <span class="text-xs font-bold text-white">{{ r.count }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full bg-brand-warning" :style="`width:${r.pct}%`" />
                  </div>
                </div>
                <p v-if="!topReportCategories.length" class="text-xs text-white/25 text-center py-6">Жалоб пока нет</p>
              </div>
            </div>

            <!-- Roles -->
            <div class="rounded-2xl border border-brand-border bg-brand-card p-6">
              <h3 class="font-extrabold text-sm text-white mb-4 flex items-center gap-2">
                <BIcon name="Users" class="w-4 h-4 text-white/40" /> Распределение ролей
              </h3>
              <div class="flex flex-wrap gap-3">
                <div v-for="rb in stats.roleBreakdown" :key="rb.role"
                  class="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-white/[0.08]"
                  style="background:rgba(255,255,255,0.04)">
                  <div class="w-2 h-2 rounded-full" :style="`background:${roleColor(rb.role)}`" />
                  <span class="text-sm font-black text-white">{{ rb.count }}</span>
                  <span class="text-xs text-white/45">{{ roleLabel(rb.role) }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- ── USERS ───────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'users'">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <div class="rounded-2xl px-3.5 py-2.5" style="background:rgba(255,255,255,0.035)">
              <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide">Всего</p>
              <p class="text-lg font-black text-white">{{ formatNum(userTotal) }}</p>
            </div>
            <div class="rounded-2xl px-3.5 py-2.5" style="background:rgba(16,185,129,0.07)">
              <p class="text-[10px] font-bold text-emerald-400/70 uppercase tracking-wide">Новых сегодня</p>
              <p class="text-lg font-black text-emerald-400">{{ userQuickStats.newToday }}</p>
            </div>
            <div class="rounded-2xl px-3.5 py-2.5" style="background:rgba(167,139,250,0.07)">
              <p class="text-[10px] font-bold text-violet-300/70 uppercase tracking-wide">С подпиской</p>
              <p class="text-lg font-black text-violet-300">{{ userQuickStats.subscribers }}</p>
            </div>
            <div class="rounded-2xl px-3.5 py-2.5" style="background:rgba(56,189,248,0.07)">
              <p class="text-[10px] font-bold text-sky-400/70 uppercase tracking-wide">Заморожено</p>
              <p class="text-lg font-black text-sky-400">{{ userQuickStats.frozen }}</p>
            </div>
          </div>

          <div class="flex items-center gap-3 mb-5">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="userSearch" @input="onUserSearch" type="text" placeholder="Поиск пользователей…"
                class="w-full bg-white/[0.06] border border-transparent rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25
                  outline-none focus:border-[#4C67CF]/40 focus:bg-white/[0.08] transition-all" />
            </div>
            <div ref="userSortRef" class="relative flex-shrink-0">
              <button type="button" @click="userSortOpen = !userSortOpen"
                class="flex items-center gap-2 bg-white/[0.06] border border-transparent rounded-2xl pl-3.5 pr-3 py-2.5 text-xs font-bold text-white/70
                  outline-none hover:bg-white/[0.08] focus:border-[#4C67CF]/40 cursor-pointer transition-all">
                {{ userSortLabel }}
                <BIcon name="ChevronDown" :class="`w-3.5 h-3.5 text-white/35 transition-transform ${userSortOpen ? 'rotate-180' : ''}`" />
              </button>
              <Transition name="fade-pop">
                <div v-if="userSortOpen"
                  class="absolute right-0 top-[calc(100%+8px)] z-30 min-w-[180px] rounded-2xl bg-[#161F40] shadow-2xl shadow-black/40 p-1.5">
                  <button v-for="opt in userSortOptions" :key="opt.value" type="button" @click="selectUserSort(opt.value as typeof userSort)"
                    class="w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                    :class="opt.value === userSort ? 'bg-[#4C67CF]/15 text-[#4C67CF]' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'">
                    {{ opt.label }}
                  </button>
                </div>
              </Transition>
            </div>
            <span class="text-xs font-bold text-white/35 bg-white/[0.06] px-3 py-2 rounded-xl">{{ userTotal }}</span>
          </div>

          <div class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden">
            <!-- Table header -->
            <div class="hidden lg:grid gap-3 px-5 py-3 border-b border-brand-border grid-cols-[2.4fr_2fr_1.1fr_1.2fr_0.85fr_1.1fr_1.2fr] items-center">
              <button v-for="col in userColumns" :key="col.label" type="button" @click="toggleUserColumnSort(col)"
                class="flex items-center gap-1 text-left text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap cursor-pointer transition-colors"
                :class="userColumnDirection(col) ? 'text-white' : 'text-white/35 hover:text-white/60'">
                {{ col.label }}
                <BIcon v-if="userColumnDirection(col) === 'desc'" name="ArrowDown" class="w-3 h-3 flex-shrink-0" />
                <BIcon v-else-if="userColumnDirection(col) === 'asc'" name="ArrowUp" class="w-3 h-3 flex-shrink-0" />
              </button>
            </div>

            <div v-if="isLoadingUsers" class="divide-y divide-brand-border">
              <div v-for="n in 6" :key="n" class="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                <div class="w-9 h-9 rounded-full bg-white/[0.08] flex-shrink-0" />
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-white/[0.08] rounded-full w-32" />
                  <div class="h-2 bg-white/5 rounded-full w-24" />
                </div>
              </div>
            </div>
            <div v-else class="divide-y divide-brand-border">
              <div v-for="user in users" :key="user.id"
                class="relative grid grid-cols-1 lg:grid-cols-[2.4fr_2fr_1.1fr_1.2fr_0.85fr_1.1fr_1.2fr] gap-2 lg:gap-3 items-center px-5 py-3 hover:bg-white/[0.03] transition-all group">

                <!-- Пользователь -->
                <div class="flex items-center gap-3 min-w-0">
                  <div class="flex-shrink-0 relative">
                    <img v-if="user.avatar_url" :src="user.avatar_url"
                      class="w-9 h-9 rounded-full object-cover border border-white/[0.06]" />
                    <div v-else class="w-9 h-9 rounded-full border border-white/[0.06] flex items-center justify-center text-sm font-bold"
                      :style="`background:${roleColor(user.role)}20;color:${roleColor(user.role)}`">
                      {{ (user.display_name || user.username || '?')[0].toUpperCase() }}
                    </div>
                  </div>
                  <div class="min-w-0">
                    <p class="font-bold text-sm text-white truncate flex items-center gap-1.5">
                      {{ user.display_name || user.username }}
                      <span v-if="tierLabel(user.subscription_tier)"
                        class="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border flex-shrink-0"
                        :style="`color:${tierColor(user.subscription_tier)};border-color:${tierColor(user.subscription_tier)}40;background:${tierColor(user.subscription_tier)}18`">
                        ✦ {{ tierLabel(user.subscription_tier) }}
                      </span>
                    </p>
                    <p class="text-xs text-white/35 truncate">@{{ user.username }}</p>
                  </div>
                </div>

                <!-- Email -->
                <p class="text-xs text-white/50 truncate">{{ user.email }}</p>

                <!-- Статус -->
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[10px] font-extrabold px-2 py-1 rounded-full flex-shrink-0"
                    :style="`background:${userStatus(user).color}20;color:${userStatus(user).color}`">
                    {{ userStatus(user).label }}
                  </span>
                  <span v-if="user.warn_count > 0" :title="`${user.warn_count}/5 предупреждений`"
                    class="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                    :class="user.warn_count >= 4 ? 'bg-rose-500/15 text-rose-400' : 'bg-amber-500/15 text-amber-400'">
                    ⚠ {{ user.warn_count }}/5
                  </span>
                </div>

                <!-- Регистрация -->
                <p class="text-xs text-white/50">{{ formatDate(user.created_at) }}</p>

                <!-- Постов -->
                <p class="text-xs text-white/70 font-semibold">{{ user._count?.posts ?? 0 }}</p>

                <!-- Подписчиков -->
                <p class="text-xs text-white/70 font-semibold">{{ user._count?.followers ?? 0 }}</p>

                <!-- Верификация -->
                <p class="text-xs font-semibold flex items-center gap-1" :class="user.badge_type ? 'text-brand-warning' : 'text-white/30'">
                  <BIcon v-if="user.badge_type" name="BadgeCheck" class="w-3.5 h-3.5" />
                  {{ user.badge_type ? 'Да' : 'Нет' }}
                </p>

                <!-- Действия — inline on mobile, floating overlay on hover at lg+ so it never fights the columns for space -->
                <div class="flex items-center gap-1.5 flex-wrap lg:flex-nowrap flex-shrink-0 justify-start mt-1 lg:mt-0
                  static lg:absolute lg:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:z-10
                  opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:pointer-events-none lg:group-hover:pointer-events-auto
                  transition-opacity lg:bg-[#0B1030]/95 lg:backdrop-blur-md lg:rounded-full lg:pl-3 lg:pr-2 lg:py-2 lg:shadow-xl lg:shadow-black/50 lg:border lg:border-white/10">
                  <button v-if="isAdminPlus" type="button" data-user-menu title="Выдать / отозвать подписку"
                    @click="toggleUserMenu(`tier-${user.id}`, $event)"
                    class="flex items-center gap-1 bg-white/[0.06] border border-transparent rounded-full pl-2.5 pr-2 py-1.5 text-xs font-bold text-white/70
                      outline-none hover:bg-white/[0.08] focus:border-violet-400/50 cursor-pointer transition-all">
                    {{ tierMenuOptions.find(o => o.value === (user.subscription_tier || 'free'))?.label }}
                    <BIcon name="ChevronDown" :class="`w-3 h-3 text-white/35 transition-transform ${activeUserMenu === `tier-${user.id}` ? 'rotate-180' : ''}`" />
                  </button>
                  <button v-if="isOwnerRole" type="button" data-user-menu
                    @click="toggleUserMenu(`role-${user.id}`, $event)"
                    class="flex items-center gap-1 bg-white/[0.06] border border-transparent rounded-full pl-2.5 pr-2 py-1.5 text-xs font-bold text-white/70
                      outline-none hover:bg-white/[0.08] focus:border-[#4C67CF]/50 cursor-pointer transition-all">
                    {{ roleLabel(user.role) }}
                    <BIcon name="ChevronDown" :class="`w-3 h-3 text-white/35 transition-transform ${activeUserMenu === `role-${user.id}` ? 'rotate-180' : ''}`" />
                  </button>
                  <span v-else class="text-xs font-bold px-2.5 py-1.5 rounded-full border"
                    :style="`color:${roleColor(user.role)};border-color:${roleColor(user.role)}30;background:${roleColor(user.role)}12`">
                    {{ roleLabel(user.role) }}
                  </span>
                  <Teleport to="body">
                    <Transition name="fade-pop">
                      <div v-if="activeUserMenu === `tier-${user.id}`" data-user-menu
                        class="fixed z-[100] min-w-[160px] rounded-2xl bg-[#161F40] shadow-2xl shadow-black/40 p-1.5"
                        :style="`top:${userMenuPos.top}px; right:${userMenuPos.right}px;`">
                        <button v-for="opt in tierMenuOptions" :key="opt.value" type="button" @click="selectUserTier(user.id, opt.value)"
                          class="w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                          :class="opt.value === (user.subscription_tier || 'free') ? 'bg-violet-400/15 text-violet-300' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'">
                          {{ opt.label }}
                        </button>
                      </div>
                    </Transition>
                  </Teleport>
                  <Teleport to="body">
                    <Transition name="fade-pop">
                      <div v-if="activeUserMenu === `role-${user.id}`" data-user-menu
                        class="fixed z-[100] min-w-[160px] rounded-2xl bg-[#161F40] shadow-2xl shadow-black/40 p-1.5"
                        :style="`top:${userMenuPos.top}px; right:${userMenuPos.right}px;`">
                        <button v-for="opt in roleMenuOptions" :key="opt.value" type="button" @click="selectUserRole(user.id, opt.value)"
                          class="w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors"
                          :class="opt.value === user.role ? 'bg-[#4C67CF]/15 text-[#4C67CF]' : 'text-white/60 hover:bg-white/[0.06] hover:text-white'">
                          {{ opt.label }}
                        </button>
                      </div>
                    </Transition>
                  </Teleport>
                  <!-- deceased / alive -->
                  <button v-if="user.deceased_at" @click="unmarkDeceased(user.id)" title="Отменить (жив)"
                    class="w-7 h-7 rounded-full bg-white/10 border border-white/15 text-white/60 hover:bg-white/20 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    ↺
                  </button>
                  <button v-else @click="markDeceased(user.id)" title="Отметить как умершего"
                    class="w-7 h-7 rounded-full bg-white/5 border border-white/10 text-white/40 hover:bg-white/15 hover:text-white/60 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    🪦
                  </button>
                  <!-- freeze / unfreeze -->
                  <button v-if="user.frozen_at" @click="unfreezeUser(user.id)" title="Разморозить"
                    class="w-7 h-7 rounded-full bg-sky-500/10 border border-sky-500/15 text-sky-400 hover:bg-sky-500/20 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    🔓
                  </button>
                  <button v-else @click="freezeUser(user.id)" title="Заморозить"
                    class="w-7 h-7 rounded-full bg-sky-500/10 border border-sky-500/15 text-sky-400 hover:bg-sky-500/20 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    🧊
                  </button>
                  <!-- clear warns -->
                  <button v-if="user.warn_count > 0" @click="clearUserWarns(user.id)" title="Сбросить варны"
                    class="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/15 text-amber-400 hover:bg-amber-500/20 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    ✖
                  </button>
                  <button @click="deleteUser(user.id)" title="Удалить"
                    class="w-7 h-7 rounded-full bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-all flex-shrink-0">
                    <BIcon name="Trash2" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="userTotal > 20" class="flex items-center justify-center gap-2 mt-4">
            <button @click="userPage--; fetchUsers()" :disabled="userPage <= 1"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <span class="text-xs font-bold text-white/40 px-3">{{ userPage }} / {{ Math.ceil(userTotal/20) }}</span>
            <button @click="userPage++; fetchUsers()" :disabled="userPage >= Math.ceil(userTotal/20)"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- ── FROZEN ─────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'frozen'">
          <div class="flex items-center gap-3 mb-5">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="frozenSearch" @input="onFrozenSearch" type="text" placeholder="Поиск среди замороженных…"
                class="w-full bg-white/5 border border-white/[0.08] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25
                  outline-none focus:border-sky-500/40 focus:bg-white/[0.08] transition-all" />
            </div>
            <span class="text-xs font-bold text-white/35 bg-white/5 px-3 py-2 rounded-xl border border-white/[0.08]">{{ frozenTotal }}</span>
          </div>

          <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
            <div v-if="isLoadingFrozen" class="divide-y divide-brand-border">
              <div v-for="n in 4" :key="n" class="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                <div class="w-9 h-9 rounded-full bg-white/[0.08] flex-shrink-0" />
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-white/[0.08] rounded-full w-32" /><div class="h-2 bg-white/5 rounded-full w-24" />
                </div>
              </div>
            </div>
            <div v-else-if="frozenUsers.length === 0"
              class="flex flex-col items-center gap-3 py-16 text-white/25">
              <BIcon name="Snowflake" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">Нет замороженных аккаунтов</p>
            </div>
            <div v-else class="divide-y divide-brand-border">
              <div v-for="user in frozenUsers" :key="user.id"
                class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-all group">
                <img v-if="user.avatar_url" :src="user.avatar_url"
                  class="w-9 h-9 rounded-full object-cover border border-white/10 flex-shrink-0" />
                <div v-else class="w-9 h-9 rounded-full border border-sky-500/20 bg-sky-500/10 flex items-center justify-center text-xs font-bold text-sky-400 flex-shrink-0">
                  {{ (user.display_name || user.username || '?')[0].toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-sm text-white truncate flex items-center gap-1.5">
                    {{ user.display_name || user.username }}
                    <span class="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/20">
                      🧊 с {{ formatDate(user.frozen_at) }}
                    </span>
                  </p>
                  <p class="text-xs text-white/35 truncate">@{{ user.username }} · {{ user._count?.posts ?? 0 }} постов</p>
                  <p v-if="user.frozen_reason" class="text-[11px] text-sky-400/70 truncate mt-0.5">{{ user.frozen_reason }}</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button @click="unfreezeUser(user.id)" title="Разморозить"
                    class="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/15 text-sky-400 hover:bg-sky-500/20 flex items-center justify-center transition-all text-xs">
                    🔓
                  </button>
                  <button v-if="user.warn_count > 0" @click="clearUserWarns(user.id)" title="Сбросить варны"
                    class="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/15 text-amber-400 hover:bg-amber-500/20 flex items-center justify-center transition-all text-xs">
                    ✖
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="frozenTotal > 20" class="flex items-center justify-center gap-2 mt-4">
            <button @click="frozenPage--; fetchFrozenUsers()" :disabled="frozenPage <= 1"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <span class="text-xs font-bold text-white/40 px-3">{{ frozenPage }} / {{ Math.ceil(frozenTotal/20) }}</span>
            <button @click="frozenPage++; fetchFrozenUsers()" :disabled="frozenPage >= Math.ceil(frozenTotal/20)"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
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
                class="w-full bg-white/5 border border-white/[0.08] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25
                  outline-none focus:border-rose-500/40 focus:bg-white/[0.08] transition-all" />
            </div>
            <span class="text-xs font-bold text-white/35 bg-white/5 px-3 py-2 rounded-xl border border-white/[0.08]">{{ archivedTotal }}</span>
          </div>

          <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
            <div v-if="isLoadingArchived" class="divide-y divide-brand-border">
              <div v-for="n in 4" :key="n" class="flex items-center gap-3 px-5 py-3.5 animate-pulse">
                <div class="w-9 h-9 rounded-full bg-white/[0.08] flex-shrink-0" />
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-white/[0.08] rounded-full w-32" /><div class="h-2 bg-white/5 rounded-full w-24" />
                </div>
              </div>
            </div>
            <div v-else-if="archivedUsers.length === 0"
              class="flex flex-col items-center gap-3 py-16 text-white/25">
              <BIcon name="Archive" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">Архив пуст</p>
            </div>
            <div v-else class="divide-y divide-brand-border">
              <div v-for="user in archivedUsers" :key="user.id"
                class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-all group opacity-60 hover:opacity-100">
                <img v-if="user.avatar_url" :src="user.avatar_url"
                  class="w-9 h-9 rounded-full object-cover border border-white/10 grayscale flex-shrink-0" />
                <div v-else class="w-9 h-9 rounded-full border border-white/[0.08] bg-white/5 flex items-center justify-center text-xs font-bold text-white/30 flex-shrink-0">
                  {{ (user.display_name || user.username || '?')[0].toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-sm text-white/70 truncate">{{ user.display_name || user.username }}</p>
                  <p class="text-xs text-white/30">@{{ user.username }} · удалён {{ formatDate(user.deleted_at) }}</p>
                  <p v-if="user.frozen_reason" class="text-[11px] text-rose-400/70 truncate mt-0.5">{{ user.frozen_reason }}</p>
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
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <span class="text-xs font-bold text-white/40 px-3">{{ archivedPage }} / {{ Math.ceil(archivedTotal/20) }}</span>
            <button @click="archivedPage++; fetchArchivedUsers()" :disabled="archivedPage >= Math.ceil(archivedTotal/20)"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- ── POSTS ──────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'posts'">
          <div class="flex items-center gap-3 mb-4 flex-wrap">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="postSearch" @input="onPostSearch" type="text" placeholder="Поиск по постам…"
                class="w-full bg-white/5 border border-white/[0.08] rounded-2xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-white/25
                  outline-none focus:border-[#4C67CF]/40 focus:bg-white/[0.08] transition-all" />
            </div>
            <button @click="fetchPosts()"
              class="px-3 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-xs text-white/50 hover:text-white transition-all">
              <BIcon name="RefreshCw" class="w-3.5 h-3.5" />
            </button>
            <span class="text-xs font-bold text-white/35 bg-white/5 px-3 py-2 rounded-xl border border-white/[0.08]">{{ postTotal }}</span>
          </div>

          <!-- Filter pills -->
          <div class="flex gap-2 mb-5 flex-wrap">
            <button v-for="f in ([
              { v: '', l: 'Все' },
              { v: 'media', l: 'С медиа' },
              { v: 'nsfw', l: 'NSFW' },
              { v: 'announcement', l: 'Объявления' },
            ] as const)" :key="f.v"
              @click="postFilter = f.v; postPage = 1; fetchPosts()"
              class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
              :class="postFilter === f.v
                ? 'bg-[#4C67CF]/15 border-[#4C67CF]/25 text-[#4C67CF]'
                : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
              {{ f.l }}
            </button>
          </div>

          <div class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden">
            <!-- Table header -->
            <div class="hidden lg:grid gap-3 px-5 py-3 border-b border-brand-border grid-cols-[1.5fr_3fr_0.6fr_0.9fr_0.6fr_0.8fr]">
              <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Автор</span>
              <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Содержание</span>
              <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Лайки</span>
              <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Комментарии</span>
              <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Repaw</span>
              <span></span>
            </div>

            <div v-if="isLoadingPosts" class="divide-y divide-brand-border">
              <div v-for="n in 5" :key="n" class="flex items-start gap-3 px-5 py-4 animate-pulse">
                <div class="w-9 h-9 rounded-full bg-white/[0.08] flex-shrink-0 mt-0.5" />
                <div class="flex-1 space-y-2">
                  <div class="h-2 bg-white/5 rounded-full w-24" />
                  <div class="h-3 bg-white/[0.08] rounded-full w-3/4" />
                  <div class="h-3 bg-white/5 rounded-full w-1/2" />
                </div>
              </div>
            </div>
            <div v-else-if="!posts.length" class="flex flex-col items-center gap-3 py-20 text-white/25">
              <BIcon name="FileText" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">Постов не найдено</p>
            </div>
            <div v-else class="divide-y divide-brand-border">
              <div v-for="post in posts" :key="post.id"
                class="grid grid-cols-1 lg:grid-cols-[1.5fr_3fr_0.6fr_0.9fr_0.6fr_0.8fr] gap-2 lg:gap-3 items-center px-5 py-4 hover:bg-white/[0.03] transition-all group">

                <!-- Автор -->
                <router-link :to="`/profile/${post.author?.username}`" target="_blank" class="flex items-center gap-2.5 min-w-0">
                  <img v-if="post.author?.avatar_url" :src="post.author.avatar_url"
                    class="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0 hover:opacity-80 transition-opacity" />
                  <div v-else class="w-8 h-8 rounded-full border border-white/10 bg-[#4C67CF]/15 flex items-center justify-center text-[#4C67CF] font-bold text-sm flex-shrink-0">
                    {{ (post.author?.display_name || post.author?.username || '?')[0].toUpperCase() }}
                  </div>
                  <span class="text-sm font-bold text-white truncate hover:text-[#4C67CF] transition-colors">{{ post.author?.display_name || post.author?.username }}</span>
                </router-link>

                <!-- Содержание -->
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span v-if="post.category"
                      class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-accent/15 text-brand-accent">
                      #{{ post.category }}
                    </span>
                    <span v-if="post.is_nsfw"
                      class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400">NSFW</span>
                    <span v-if="post.is_announcement"
                      class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Закреплено</span>
                    <span v-if="post.is_paid"
                      class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">Платно</span>
                  </div>
                  <p v-if="post.title" class="text-sm font-bold text-white/90 truncate">{{ post.title }}</p>
                  <p class="text-sm text-white/70 truncate">{{ post.content }}</p>
                  <div v-if="post.media_urls?.length" class="flex gap-1.5 mt-1.5">
                    <button v-for="(url, i) in post.media_urls.slice(0, 4)" :key="i"
                      @click="openPostMediaLightbox(post.media_urls, i)"
                      class="relative w-10 h-10 rounded-lg overflow-hidden border border-white/10 hover:border-[#4C67CF]/40 transition-all flex-shrink-0">
                      <img :src="url" class="w-full h-full object-cover" />
                      <div v-if="i === 3 && post.media_urls.length > 4"
                        class="absolute inset-0 bg-black/65 flex items-center justify-center text-white text-[9px] font-bold">
                        +{{ post.media_urls.length - 4 }}
                      </div>
                    </button>
                  </div>
                </div>

                <!-- Лайки -->
                <p class="text-sm text-white/70 font-semibold">{{ formatNum(post._count?.votes ?? 0) }}</p>
                <!-- Комментарии -->
                <p class="text-sm text-white/70 font-semibold">{{ formatNum(post._count?.comments ?? 0) }}</p>
                <!-- Repaw -->
                <p class="text-sm text-white/70 font-semibold">{{ formatNum(post._count?.repaws ?? 0) }}</p>

                <!-- Actions -->
                <div class="flex items-center gap-1.5 flex-shrink-0 justify-start lg:justify-end">
                  <router-link :to="`/post/${post.id}`" target="_blank"
                    class="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/50 hover:text-white hover:bg-white/10
                      flex items-center justify-center transition-all" title="Открыть на сайте">
                    <BIcon name="ExternalLink" class="w-3.5 h-3.5" />
                  </router-link>
                  <button @click="togglePostPin(post)" title="Закрепить / открепить"
                    class="w-8 h-8 rounded-full border flex items-center justify-center transition-all"
                    :class="post.is_announcement
                      ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                      : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'">
                    <BIcon name="Pin" class="w-3.5 h-3.5" />
                  </button>
                  <button @click="deletePost(post.id)"
                    class="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20
                      flex items-center justify-center transition-all" title="Удалить">
                    <BIcon name="Trash2" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div v-if="postTotal > 20" class="flex items-center justify-center gap-2 mt-4">
            <button @click="postPage--; fetchPosts()" :disabled="postPage <= 1"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <span class="text-xs font-bold text-white/40 px-3">{{ postPage }} / {{ Math.ceil(postTotal/20) }}</span>
            <button @click="postPage++; fetchPosts()" :disabled="postPage >= Math.ceil(postTotal/20)"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>

          <PostLightbox v-if="postMediaLightbox"
            :images="postMediaLightbox.images"
            :start-index="postMediaLightbox.start"
            @close="postMediaLightbox = null" />
        </div>

        <!-- ── REPORTS ─────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'reports'">
          <!-- Filter pills -->
          <div class="flex gap-2 mb-5 flex-wrap">
            <button v-for="s in (['', 'pending', 'resolved', 'dismissed'] as const)" :key="s"
              @click="reportFilter = s; fetchReports()"
              class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
              :class="reportFilter === s
                ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent'
                : 'bg-brand-card border-brand-border text-white/40 hover:text-white/70'">
              {{ { '': 'Все', pending: 'На рассмотрении', resolved: 'Решено', dismissed: 'Отклонено' }[s] }}
            </button>
          </div>

          <div v-if="isLoadingReports" class="space-y-3">
            <div v-for="n in 4" :key="n" class="h-24 rounded-2xl border border-brand-border bg-brand-card animate-pulse" />
          </div>
          <div v-else-if="reports.length === 0"
            class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
            <BIcon name="Flag" class="w-10 h-10 opacity-40" />
            <p class="text-sm font-semibold">Жалоб нет</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="folder in reports" :key="reportGroupKey(folder)"
              class="rounded-2xl border border-brand-border bg-brand-card p-4">
              <div class="flex items-start justify-between gap-4 flex-wrap">
                <div class="min-w-0 flex-1">
                  <!-- Tag pills -->
                  <div class="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/[0.08] text-white/60">
                      {{ REPORT_TARGET_LABEL[folder.target_type] ?? folder.target_type }}
                    </span>
                    <span v-if="folder.target_type === 'post' && folder.post?.is_nsfw"
                      class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">NSFW</span>
                    <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                      :class="folder.status === 'pending'
                        ? 'bg-amber-500/15 text-amber-400'
                        : folder.status === 'resolved'
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-white/5 text-white/30'">
                      {{ { pending: 'На рассмотрении', resolved: 'Решено', dismissed: 'Отклонено' }[folder.status] }}
                    </span>
                    <span v-if="folder.count > 1"
                      class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400"
                      :title="`${folder.count} жалоб на один и тот же объект`">
                      ×{{ folder.count }}
                    </span>
                  </div>

                  <!-- Title = complaint reason -->
                  <p class="font-bold text-white">{{ folder.reports[0].reason }}</p>

                  <!-- Evidence attached by the reporter -->
                  <div v-if="folder.reports[0].evidence_urls?.length" class="flex gap-2 mt-2 flex-wrap">
                    <a v-for="(url, ei) in folder.reports[0].evidence_urls" :key="ei" :href="url" target="_blank" rel="noopener"
                      class="w-14 h-14 rounded-lg overflow-hidden border border-white/[0.08] flex-shrink-0">
                      <img :src="url" class="w-full h-full object-cover" />
                    </a>
                  </div>

                  <!-- Subtitle: reporter + target -->
                  <p class="text-xs text-white/40 mt-1">
                    Жалоба от <span class="font-semibold text-white/60">{{ folder.reports[0].reporter?.display_name || folder.reports[0].reporter?.username }}</span>
                    на {{ (REPORT_TARGET_LABEL[folder.target_type] ?? folder.target_type).toLowerCase() }}
                    <router-link v-if="folder.target_type === 'post' && folder.post" :to="`/post/${folder.target_id}`" target="_blank" class="font-semibold text-brand-accent hover:underline">@{{ folder.post.author?.username }}</router-link>
                    <router-link v-else-if="folder.target_type === 'user' && folder.reportedUser" :to="`/profile/${folder.reportedUser.username}`" target="_blank" class="font-semibold text-brand-accent hover:underline">@{{ folder.reportedUser.username }}</router-link>
                    <router-link v-else-if="folder.target_type === 'group' && folder.reportedGroup" :to="`/groups/${folder.reportedGroup.slug}`" target="_blank" class="font-semibold text-brand-accent hover:underline">{{ folder.reportedGroup.name }}</router-link>
                    <span v-else class="font-semibold text-white/50">{{ folder.target_id.slice(0, 8) }}…</span>
                    · {{ formatDate(folder.created_at) }}
                  </p>

                  <button v-if="folder.count > 1" @click="toggleReportGroup(folder)"
                    class="text-[11px] font-bold text-brand-accent/80 hover:text-brand-accent mt-1.5 transition-colors">
                    {{ expandedReportGroups.has(reportGroupKey(folder)) ? 'Скрыть' : 'Показать все жалобы' }} ({{ folder.count }})
                  </button>
                  <Transition name="filter-expand">
                    <div v-if="folder.count > 1 && expandedReportGroups.has(reportGroupKey(folder))"
                      class="mt-2 space-y-1.5 border-t border-brand-border pt-2 max-h-40 overflow-y-auto">
                      <p v-for="r in folder.reports" :key="r.id" class="text-xs text-white/50">
                        {{ r.reason }}
                        <span class="text-white/25">— @{{ r.reporter?.username }} · {{ formatDate(r.created_at) }}</span>
                      </p>
                    </div>
                  </Transition>
                </div>

                <!-- Actions -->
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button @click="openResolveModal(folder)" :disabled="folder.status !== 'pending'"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <BIcon name="TriangleAlert" class="w-3.5 h-3.5" /> Решить проблему
                  </button>
                  <button @click="resolveReportGroup(folder, 'dismissed')" :disabled="folder.status !== 'pending'"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <BIcon name="X" class="w-3.5 h-3.5" /> Отклонить
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ResolveReportModal v-if="resolvingFolder" :folder="resolvingFolder"
            @close="resolvingFolder = null" @resolved="onFolderResolved" />
        </div>

        <!-- ── APPEALS ─────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'appeals'">
          <div v-if="isLoadingAppeals" class="space-y-3">
            <div v-for="n in 3" :key="n" class="h-28 rounded-2xl border border-brand-border bg-brand-card animate-pulse" />
          </div>
          <div v-else-if="appeals.length === 0"
            class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
            <BIcon name="Gavel" class="w-10 h-10 opacity-40" />
            <p class="text-sm font-semibold">Апелляций на рассмотрении нет</p>
          </div>
          <div v-else class="space-y-3">
            <div v-for="a in appeals" :key="a.id" class="rounded-2xl border border-brand-border bg-brand-card p-4">
              <div class="flex items-start gap-3">
                <img v-if="a.user?.avatar_url" :src="a.user.avatar_url" class="w-9 h-9 rounded-full object-cover border border-white/10 flex-shrink-0" />
                <div v-else class="w-9 h-9 rounded-full border border-violet-500/20 bg-violet-500/10 flex items-center justify-center text-xs font-bold text-violet-400 flex-shrink-0">
                  {{ (a.user?.display_name || a.user?.username || '?')[0].toUpperCase() }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="font-bold text-sm text-white truncate">{{ a.user?.display_name || a.user?.username }} <span class="text-white/30 font-normal">@{{ a.user?.username }}</span></p>
                  <p class="text-xs text-white/40 mt-1"><span class="font-bold text-amber-400">Причина предупреждения:</span> {{ a.reason }}</p>
                  <img v-if="a.image_url" :src="a.image_url" class="mt-2 max-h-32 rounded-xl border border-white/10 object-cover" />
                  <p class="text-xs text-white/60 mt-2 bg-white/[0.03] border border-white/[0.08] rounded-xl p-2.5"><span class="font-bold text-violet-400">Апелляция:</span> {{ a.appeal_text }}</p>
                  <p class="text-[11px] text-white/25 mt-1.5">{{ formatDate(a.appeal_created_at) }}</p>
                </div>
                <div class="flex flex-col gap-2 flex-shrink-0">
                  <button @click="decideAppeal(a.id, 'accepted')" :disabled="decidingAppealId === a.id"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 transition-all">
                    <BIcon name="Check" class="w-3.5 h-3.5" /> Принять
                  </button>
                  <button @click="decideAppeal(a.id, 'rejected')" :disabled="decidingAppealId === a.id"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-white/40 hover:text-white disabled:opacity-30 transition-all">
                    <BIcon name="X" class="w-3.5 h-3.5" /> Отклонить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── SUPPORT ────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'support'">
          <!-- Filter pills -->
          <div class="flex gap-2 mb-5 flex-wrap">
            <button v-for="s in (['', 'open', 'in_progress', 'resolved', 'closed'] as const)" :key="s"
              @click="supportFilter = s; fetchSupportTickets()"
              class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
              :class="supportFilter === s
                ? 'bg-[#4C67CF]/15 border-[#4C67CF]/25 text-[#8fa0ec]'
                : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
              {{ s === '' ? 'Все' : SUPPORT_STATUS_LABEL[s] }}
            </button>
          </div>

          <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
            <div v-if="isLoadingSupport" class="divide-y divide-brand-border">
              <div v-for="n in 4" :key="n" class="flex gap-3 px-5 py-4 animate-pulse">
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-white/[0.08] rounded-full w-48" /><div class="h-2 bg-white/5 rounded-full w-32" />
                </div>
              </div>
            </div>
            <div v-else-if="supportTickets.length === 0"
              class="flex flex-col items-center gap-3 py-16 text-white/25">
              <BIcon name="LifeBuoy" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">Обращений нет</p>
            </div>
            <div v-else class="divide-y divide-brand-border">
              <div v-for="ticket in supportTickets" :key="ticket.id" class="px-5 py-4 hover:bg-white/[0.03] transition-all">
                <div class="flex items-start gap-4">
                  <div class="flex-shrink-0 mt-1.5">
                    <div class="w-2.5 h-2.5 rounded-full" :style="`background:${SUPPORT_STATUS_COLOR[ticket.status]}`" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                      <span class="text-xs font-bold px-2 py-0.5 rounded-full border"
                        :style="`color:${SUPPORT_STATUS_COLOR[ticket.status]};background:${SUPPORT_STATUS_COLOR[ticket.status]}1a;border-color:${SUPPORT_STATUS_COLOR[ticket.status]}30`">
                        {{ SUPPORT_STATUS_LABEL[ticket.status] }}
                      </span>
                      <span class="text-[10px] text-white/25 uppercase font-bold">{{ SUPPORT_TYPE_LABEL[ticket.type] ?? ticket.type }}</span>
                      <span class="text-[10px] text-white/25">{{ formatDate(ticket.created_at) }}</span>
                    </div>
                    <p class="text-sm text-white/80 font-bold">{{ ticket.subject }}</p>
                    <p class="text-xs text-white/50 mt-1 whitespace-pre-wrap">{{ ticket.message }}</p>
                    <p class="text-xs text-white/30 mt-1.5">
                      от @{{ ticket.user?.username }}
                      <span v-if="ticket.contact_email"> · {{ ticket.contact_email }}</span>
                    </p>

                    <div v-if="ticket.attachment_urls?.length" class="flex gap-2 mt-2 flex-wrap">
                      <a v-for="(url, ai) in ticket.attachment_urls" :key="ai" :href="url" target="_blank" rel="noopener"
                        class="w-16 h-16 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                        <img :src="url" class="w-full h-full object-cover" />
                      </a>
                    </div>

                    <div v-if="ticket.admin_reply" class="mt-3 px-3 py-2 rounded-xl bg-white/5 border border-white/[0.06]">
                      <p class="text-[10px] font-bold text-white/30 mb-0.5">Ответ {{ ticket.replier?.username ? `(@${ticket.replier.username})` : '' }}</p>
                      <p class="text-xs text-white/70 whitespace-pre-wrap">{{ ticket.admin_reply }}</p>
                    </div>

                    <div class="mt-3 flex flex-col sm:flex-row gap-2">
                      <input v-model="supportReplyDrafts[ticket.id]" type="text" placeholder="Ответ пользователю..."
                        class="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#4C67CF]/40" />
                      <div class="flex gap-2 flex-shrink-0">
                        <button @click="replySupportTicket(ticket.id, 'in_progress')"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 transition-all">
                          В работу
                        </button>
                        <button @click="replySupportTicket(ticket.id, 'resolved')"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                          ✓ Решено
                        </button>
                        <button @click="replySupportTicket(ticket.id, 'closed')"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 border border-white/[0.08] text-white/40 hover:text-white transition-all">
                          Закрыть
                        </button>
                      </div>
                    </div>
                  </div>
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
              style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 16px rgba(76,103,207,0.3)">
              <BIcon name="Plus" class="w-3.5 h-3.5" /> Создать
            </button>
          </div>

          <!-- Где показывается: мини-визуал мест размещения -->
          <div class="rounded-3xl border border-brand-border p-5 mb-5" style="background:#1F223C">
            <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Где показывается на сайте</p>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <!-- Лента (hero) -->
              <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
                <div class="w-full h-14 rounded-xl bg-white/5 flex overflow-hidden mb-2">
                  <div class="w-10 h-full bg-white/10 flex-shrink-0" />
                  <div class="flex-1 px-2 py-1.5 space-y-1">
                    <div class="h-1.5 w-8 rounded-full bg-[#4C67CF]/50" />
                    <div class="h-1.5 w-16 rounded-full bg-white/25" />
                  </div>
                </div>
                <p class="text-[11px] font-bold text-white/70">Верх ленты</p>
                <p class="text-[10px] text-white/30">Крупный блок над постами на главной</p>
                <p class="text-[10px] font-bold text-[#4C67CF] mt-1">от 1500 ₽ / нед.</p>
              </div>
              <!-- Левый сайдбар -->
              <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
                <div class="w-full h-14 rounded-xl bg-white/5 flex flex-col overflow-hidden mb-2 p-1.5 gap-1">
                  <div class="h-2 w-10 rounded bg-white/10" />
                  <div class="h-2 w-8 rounded bg-white/10" />
                  <div class="h-2 w-9 rounded bg-[#4C67CF]/40" />
                </div>
                <p class="text-[11px] font-bold text-white/70">Левое меню</p>
                <p class="text-[10px] text-white/30">Карточка под навигацией слева</p>
                <p class="text-[10px] font-bold text-[#4C67CF] mt-1">от 800 ₽ / нед.</p>
              </div>
              <!-- Правый сайдбар -->
              <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
                <div class="w-full h-14 rounded-xl bg-white/5 flex flex-col overflow-hidden mb-2 p-1.5 gap-1">
                  <div class="h-2 w-9 rounded bg-[#4C67CF]/40" />
                  <div class="h-2 w-full rounded bg-white/10" />
                  <div class="h-2 w-7 rounded bg-white/10" />
                </div>
                <p class="text-[11px] font-bold text-white/70">Правая колонка</p>
                <p class="text-[10px] text-white/30">Над трендовыми тегами (только xl-экраны)</p>
                <p class="text-[10px] font-bold text-[#4C67CF] mt-1">от 600 ₽ / нед.</p>
              </div>
              <!-- Страница групп -->
              <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
                <div class="w-full h-14 rounded-xl bg-white/5 flex overflow-hidden mb-2">
                  <div class="w-10 h-full bg-white/10 flex-shrink-0" />
                  <div class="flex-1 px-2 py-1.5 space-y-1">
                    <div class="h-1.5 w-8 rounded-full bg-[#4C67CF]/50" />
                    <div class="h-1.5 w-16 rounded-full bg-white/25" />
                  </div>
                </div>
                <p class="text-[11px] font-bold text-white/70">Страница «Группы»</p>
                <p class="text-[10px] text-white/30">Крупный блок над поиском групп</p>
                <p class="text-[10px] font-bold text-[#4C67CF] mt-1">от 1200 ₽ / нед.</p>
              </div>
            </div>
            <p class="text-[11px] text-white/25 mt-3">Если активных объявлений нет — на этих местах показывается карточка «Здесь может быть ваша реклама» со ссылкой на заявку. Цены ориентировочные — окончательная сумма обсуждается с заявителем вручную.</p>
          </div>

          <!-- Create form -->
          <Transition name="filter-expand">
            <div v-if="showAdForm"
              class="rounded-3xl border border-[#4C67CF]/20 p-6 mb-5 shadow-xl"
              style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))">
              <h4 class="font-extrabold text-sm text-white mb-4">Новое объявление</h4>
              <div class="space-y-3">
                <input v-model="newAd.title" placeholder="Заголовок *"
                  class="adm-input" />
                <textarea v-model="newAd.description" placeholder="Описание"
                  class="adm-input resize-none h-20" />
                <input v-model="newAd.linkUrl" type="url" placeholder="Ссылка *"
                  class="adm-input" />
                <input v-model="newAd.priceLabel" placeholder="Ценник (напр. «1500 ₽ / неделя»)"
                  class="adm-input" />
                <div>
                  <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">Изображение (опционально)</p>
                  <div v-if="newAd.imageUrl" class="flex items-center gap-3 p-3 bg-white/5 border border-white/[0.08] rounded-2xl">
                    <img :src="newAd.imageUrl" class="w-16 h-12 object-cover rounded-xl flex-shrink-0" />
                    <span class="flex-1 text-xs text-white/45 truncate">Загружено</span>
                    <button @click="newAd.imageUrl = ''" class="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-rose-500/20 flex items-center justify-center transition-all">
                      <BIcon name="X" class="w-3.5 h-3.5 text-white/60" />
                    </button>
                  </div>
                  <MediaUpload v-else type="banners" @uploaded="(urls) => newAd.imageUrl = urls[0] ?? ''" />
                </div>
              </div>

              <!-- Live preview: exactly how the card renders on-site -->
              <div v-if="newAd.title" class="mt-4">
                <p class="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1.5">Превью карточки</p>
                <div class="max-w-xs bg-brand-card border border-brand-accent/25 rounded-3xl overflow-hidden shadow-xl">
                  <img v-if="newAd.imageUrl" :src="newAd.imageUrl" class="w-full object-cover max-h-28" />
                  <div class="px-4 py-3">
                    <span class="text-[9px] font-bold uppercase tracking-wider text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded-full border border-brand-accent/20">Реклама</span>
                    <p class="text-xs font-bold text-white leading-snug mt-1.5">{{ newAd.title }}</p>
                    <p v-if="newAd.description" class="text-[11px] text-white/55 mt-0.5 line-clamp-2">{{ newAd.description }}</p>
                    <p v-if="newAd.priceLabel" class="text-[11px] font-bold text-[#4C67CF] mt-1">{{ newAd.priceLabel }}</p>
                  </div>
                </div>
              </div>

              <div class="flex gap-2 justify-end mt-4">
                <button @click="showAdForm = false"
                  class="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white hover:bg-white/5 border border-white/[0.08] transition-all">Отмена</button>
                <button @click="submitAd" :disabled="isSubmittingAd || !newAd.title || !newAd.linkUrl"
                  class="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all shadow-lg"
                  style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 12px rgba(76,103,207,0.3)">
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
              class="rounded-3xl border border-brand-border p-4 flex items-start gap-4 hover:border-white/10 transition-all"
              style="background:#1F223C">
              <img v-if="ad.image_url" :src="ad.image_url" class="w-16 h-16 rounded-2xl object-cover border border-white/[0.08] flex-shrink-0" />
              <div v-else class="w-16 h-16 rounded-2xl bg-white/5 border border-white/[0.08] flex-shrink-0 flex items-center justify-center">
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
                  <span v-if="ad.price_label" class="text-[10px] font-bold text-[#4C67CF] bg-[#4C67CF]/10 px-2 py-0.5 rounded-full border border-[#4C67CF]/20">{{ ad.price_label }}</span>
                </div>
                <p class="font-bold text-sm text-white">{{ ad.title }}</p>
                <p v-if="ad.description" class="text-xs text-white/40 mt-0.5 line-clamp-1">{{ ad.description }}</p>
                <a :href="ad.link_url" target="_blank" class="text-xs text-[#4C67CF] hover:text-[#4C67CF]/80 mt-0.5 block truncate transition-colors">{{ ad.link_url }}</a>
                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                  <router-link v-if="ad.requester" :to="`/profile/${ad.requester.username}`" target="_blank"
                    class="text-[11px] text-white/35 hover:text-white/60 transition-colors">
                    от @{{ ad.requester.username }}
                  </router-link>
                  <span v-if="ad.contact_info" class="text-[11px] text-white/25">· контакт: {{ ad.contact_info }}</span>
                </div>
              </div>
              <div class="flex flex-col gap-2 flex-shrink-0">
                <template v-if="ad.status === 'pending'">
                  <button @click="reviewAd(ad.id, 'active')"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                    Одобрить
                  </button>
                  <button @click="reviewAd(ad.id, 'rejected')"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-all">
                    Отклонить
                  </button>
                </template>
                <button @click="deleteAd(ad.id)" title="Удалить"
                  class="w-7 h-7 rounded-xl bg-white/5 border border-white/[0.08] text-white/40 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/20 flex items-center justify-center transition-all self-end">
                  <BIcon name="Trash2" class="w-3.5 h-3.5" />
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
                : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
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
            <div v-else class="space-y-3">
              <div v-for="req in verRequests" :key="req.id"
                class="rounded-3xl border border-brand-border overflow-hidden hover:border-blue-500/15 transition-all"
                style="background:#1F223C">
                <div class="px-5 py-4 flex items-start gap-4">

                  <!-- Left: identity + status + criteria -->
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap mb-2.5">
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
                        <img v-if="verTypeLabels[req.verification_type]"
                          :src="`/icons/badges/${req.verification_type}.svg`" class="w-3 h-3" />
                        {{ verTypeLabels[req.verification_type] || req.verification_type }}
                      </span>
                      <span class="text-[10px] text-white/25 ml-auto">{{ formatDate(req.created_at) }}</span>
                    </div>

                    <!-- Identity — click through to the profile -->
                    <router-link :to="`/profile/${req.user?.username}`" target="_blank"
                      class="flex items-center gap-3 group/user w-fit">
                      <img v-if="req.user?.avatar_url" :src="req.user.avatar_url"
                        class="w-10 h-10 rounded-2xl object-cover border border-white/10 flex-shrink-0" />
                      <div v-else class="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold flex-shrink-0">
                        {{ (req.user?.display_name || req.user?.username || '?')[0].toUpperCase() }}
                      </div>
                      <div class="min-w-0">
                        <p class="font-extrabold text-sm text-white group-hover/user:text-blue-400 transition-colors flex items-center gap-1">
                          {{ req.user?.display_name || req.user?.username }}
                          <BIcon name="ExternalLink" class="w-3 h-3 opacity-0 group-hover/user:opacity-60 transition-opacity" />
                        </p>
                        <p class="text-xs text-white/35">@{{ req.user?.username }}</p>
                      </div>
                    </router-link>

                    <!-- Criteria — compact two-column checklist instead of a wall of pills -->
                    <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 max-w-xs">
                      <span v-for="chip in [
                        {label: req.account_age_days+' дн.', ok: req.account_age_days>=14},
                        {label: req.post_count+' постов', ok: req.post_count>=3},
                        {label: 'Аватар', ok: req.has_avatar},
                        {label: 'Био', ok: req.has_bio},
                        {label: 'Email', ok: req.has_email},
                        {label: req.follower_count+' подписч.', ok: req.follower_count>=5},
                      ]" :key="chip.label"
                        class="text-[11px] font-semibold flex items-center gap-1"
                        :class="chip.ok ? 'text-emerald-400/80' : 'text-rose-400/80'">
                        <span class="text-[10px]">{{ chip.ok ? '✓' : '✗' }}</span> {{ chip.label }}
                      </span>
                    </div>
                  </div>

                  <!-- Right: evidence, expanded, + review actions -->
                  <div class="flex-shrink-0 w-40 sm:w-48 flex flex-col gap-3">
                    <div v-if="req.evidence_urls?.length">
                      <p class="text-[10px] font-bold text-white/30 uppercase tracking-wide mb-1.5">Доказательства ({{ req.evidence_urls.length }})</p>
                      <div class="grid grid-cols-3 gap-1.5">
                        <button v-for="(url,i) in req.evidence_urls.slice(0,6)" :key="i"
                          @click="openEvidenceLightbox(req.evidence_urls, i)"
                          class="relative aspect-square rounded-xl overflow-hidden border border-white/[0.08] hover:border-blue-500/40 transition-all group/ev">
                          <img :src="url" class="w-full h-full object-cover" />
                          <div v-if="i===5 && req.evidence_urls.length>6"
                            class="absolute inset-0 bg-black/65 flex items-center justify-center text-white text-xs font-bold">
                            +{{ req.evidence_urls.length - 6 }}
                          </div>
                          <div class="absolute inset-0 bg-black/0 group-hover/ev:bg-black/20 transition-colors" />
                        </button>
                      </div>
                    </div>
                    <div v-if="req.evidence_text" class="bg-white/[0.03] border border-white/[0.08] rounded-xl px-2.5 py-2">
                      <p class="text-[10px] font-bold text-blue-400 uppercase tracking-wide mb-1">Текстовое доказательство</p>
                      <p class="text-[11px] text-white/70 whitespace-pre-line line-clamp-4">{{ req.evidence_text }}</p>
                    </div>
                    <p v-if="!req.evidence_urls?.length && !req.evidence_text" class="text-[11px] text-white/25">Без доказательств</p>

                    <div v-if="req.status === 'pending'" class="flex flex-col gap-1.5 mt-auto">
                      <button @click="reviewVerRequest(req.id,'approve')"
                        class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                        ✓ Одобрить
                      </button>
                      <button @click="rejectVerRequest(req.id)"
                        class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-all">
                        Отклонить
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <PostLightbox v-if="evidenceLightbox"
            :images="evidenceLightbox.images"
            :start-index="evidenceLightbox.start"
            @close="evidenceLightbox = null" />
        </div>

        <!-- ── BANNERS ─────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'banners'">
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-xs text-white/35 font-semibold">{{ banners.length }}/7 баннеров · карусель стикеров</p>
            </div>
            <button @click="openBannerCreate" :disabled="banners.length >= 7"
              class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
              style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 16px rgba(76,103,207,0.3)">
              <BIcon name="Plus" class="w-3.5 h-3.5" /> Новый баннер
            </button>
          </div>

          <!-- Form -->
          <div v-if="showBannerForm"
            class="rounded-3xl border border-[#a78bfa]/20 p-6 mb-5 shadow-xl"
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
                <div v-if="bannerForm.image_url" class="flex items-center gap-3 p-3 bg-white/5 border border-white/[0.08] rounded-2xl">
                  <img :src="bannerForm.image_url" class="w-20 h-12 object-cover rounded-xl flex-shrink-0 border border-white/10" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-white/60">Изображение загружено</p>
                    <p class="text-[10px] text-white/30 truncate mt-0.5">{{ bannerForm.image_url }}</p>
                  </div>
                  <button type="button" @click="bannerForm.image_url = ''"
                    class="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-rose-500/20 flex items-center justify-center transition-all flex-shrink-0">
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
                    : 'bg-white/5 text-white/40 border-white/[0.08]'">
                  <BIcon :name="bannerForm.is_active ? 'Eye' : 'EyeOff'" class="w-4 h-4" />
                  {{ bannerForm.is_active ? 'Активен' : 'Скрыт' }}
                </button>
              </div>
            </div>

            <!-- Live preview -->
            <div v-if="bannerForm.gradient || bannerForm.image_url"
              class="mt-5 rounded-2xl overflow-hidden h-28 relative border border-white/[0.08]">
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
                style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 14px rgba(76,103,207,0.35)">
                Сохранить
              </button>
              <button @click="showBannerForm = false"
                class="px-5 py-2.5 rounded-2xl text-sm font-bold bg-white/5 border border-white/[0.08] text-white/50 hover:text-white transition-all">
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
              class="rounded-3xl border border-brand-border overflow-hidden hover:border-[#a78bfa]/20 transition-all group"
              style="background:#1F223C">
              <div class="flex items-center gap-4 p-4">
                <!-- Thumbnail -->
                <div class="w-24 h-16 rounded-2xl overflow-hidden flex-shrink-0 border border-white/[0.08] relative">
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
                    :class="b.is_active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-white/5 border-white/[0.08] text-white/35 hover:text-white'">
                    <BIcon :name="b.is_active ? 'Eye' : 'EyeOff'" class="w-3.5 h-3.5" />
                  </button>
                  <button @click="openBannerEdit(b)"
                    class="w-8 h-8 rounded-xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white hover:border-[#a78bfa]/30 flex items-center justify-center transition-all">
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
              class="bg-[#1F223C] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 outline-none focus:border-rose-500/40 cursor-pointer">
              <option value="">Все действия</option>
              <option value="warn">⚠️ warn</option>
              <option value="freeze">🧊 freeze</option>
              <option value="unfreeze">🔓 unfreeze</option>
              <option value="ban">🚫 ban</option>
              <option value="flag_post">🚩 flag_post</option>
              <option value="clear_warns">✖ clear_warns</option>
            </select>
            <select v-model="autoModCategoryFilter" @change="autoModPage=1; fetchAutoModLogs()"
              class="bg-[#1F223C] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 outline-none focus:border-rose-500/40 cursor-pointer">
              <option value="">Все категории</option>
              <option value="spam">🔁 spam</option>
              <option value="toxic">🤬 toxic</option>
              <option value="duplicate">📋 duplicate</option>
              <option value="fraud">🚨 fraud</option>
              <option value="suspicious">👁️ suspicious</option>
              <option value="manual">🛡️ manual</option>
            </select>
            <button @click="fetchAutoModLogs()"
              class="px-3 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-xs text-white/50 hover:text-white transition-all">
              <BIcon name="RefreshCw" class="w-3.5 h-3.5" />
            </button>
            <span class="ml-auto text-xs font-bold text-white/30 bg-white/5 px-3 py-2 rounded-xl border border-white/[0.08]">{{ autoModTotal }} событий</span>
          </div>

          <!-- Logs -->
          <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
            <div v-if="isLoadingAutoMod" class="divide-y divide-brand-border">
              <div v-for="n in 8" :key="n" class="flex items-center gap-3 px-5 py-3 animate-pulse">
                <div class="w-8 h-8 rounded-full bg-white/[0.08] flex-shrink-0" />
                <div class="flex-1 space-y-2">
                  <div class="h-3 bg-white/[0.08] rounded-full w-48" />
                  <div class="h-2 bg-white/5 rounded-full w-32" />
                </div>
                <div class="h-5 w-14 bg-white/[0.08] rounded-full" />
              </div>
            </div>
            <div v-else-if="!autoModLogs.length" class="flex flex-col items-center gap-4 py-20 text-white/25">
              <div class="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-2xl">🛡️</div>
              <p class="text-sm font-semibold">Журнал пуст</p>
              <p class="text-xs">AutoMod пока не зафиксировал нарушений</p>
            </div>
            <div v-else class="divide-y divide-brand-border">
              <div v-for="log in autoModLogs" :key="log.id"
                class="flex items-start gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-all">
                <!-- Avatar -->
                <img v-if="log.user?.avatar_url" :src="log.user.avatar_url"
                  class="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0 mt-0.5" />
                <div v-else
                  class="w-8 h-8 rounded-full bg-white/[0.08] border border-white/10 flex items-center justify-center text-xs font-bold text-white/50 flex-shrink-0 mt-0.5">
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
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronLeft" class="w-4 h-4" />
            </button>
            <span class="text-xs font-bold text-white/40 px-3">{{ autoModPage }} / {{ autoModPages }}</span>
            <button @click="autoModPage++; fetchAutoModLogs()" :disabled="autoModPage >= autoModPages"
              class="w-9 h-9 rounded-2xl bg-white/5 border border-white/[0.08] text-white/40 hover:text-white disabled:opacity-25 flex items-center justify-center transition-all">
              <BIcon name="ChevronRight" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- ── STATISTICS ─────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'statistics'">

          <!-- Sub-tabs -->
          <div class="flex gap-2 mb-6">
            <button @click="statsSubTab='stickers'"
              class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
              :class="statsSubTab==='stickers'
                ? 'text-white border border-emerald-500/30'
                : 'text-white/40 hover:text-white/70 bg-white/[0.03] border border-brand-border'"
              :style="statsSubTab==='stickers' ? 'background:rgba(16,185,129,0.12)' : ''">
              <BIcon name="Sticker" class="w-4 h-4" /> Стикеры
            </button>
            <button @click="statsSubTab='network'"
              class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
              :class="statsSubTab==='network'
                ? 'text-white border border-emerald-500/30'
                : 'text-white/40 hover:text-white/70 bg-white/[0.03] border border-brand-border'"
              :style="statsSubTab==='network' ? 'background:rgba(16,185,129,0.12)' : ''">
              <BIcon name="Globe" class="w-4 h-4" /> Сеть
            </button>
            <button @click="stickerStats=null; networkStats=null; fetchStatistics()"
              class="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs text-white/40 hover:text-white bg-white/[0.03] border border-brand-border transition-all">
              <BIcon name="RefreshCw" class="w-3.5 h-3.5" /> Обновить
            </button>
          </div>

          <!-- Loading skeleton -->
          <template v-if="isLoadingStatistics">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div v-for="n in 4" :key="n" class="rounded-3xl border border-brand-border p-6 animate-pulse" style="background:#1F223C">
                <div class="h-4 bg-white/[0.08] rounded-full w-32 mb-4" />
                <div class="space-y-2">
                  <div v-for="i in 5" :key="i" class="h-6 bg-white/5 rounded-xl" :style="`width:${60+i*8}%`" />
                </div>
              </div>
            </div>
          </template>

          <!-- ─── STICKERS sub-tab ─────────────────────────────────── -->
          <template v-else-if="statsSubTab === 'stickers' && stickerStats">

            <!-- Top row summary -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">Паков всего</p>
                <p class="text-2xl font-black text-white">{{ stickerStats.topPacks.length }}+</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">Топ-1 использований</p>
                <p class="text-2xl font-black text-emerald-400">{{ formatNum(stickerStats.topPacks[0]?.use_count ?? 0) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">Топ-1 скачиваний</p>
                <p class="text-2xl font-black text-indigo-400">{{ formatNum(stickerStats.topPacks[0]?.downloads_count ?? 0) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">Уникальных стикеров</p>
                <p class="text-2xl font-black text-white">{{ formatNum(stickerStats.topStickers.length) }}</p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

              <!-- Top Packs list -->
              <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
                <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
                  <BIcon name="TrendingUp" class="w-4 h-4 text-emerald-400" />
                  <h3 class="font-extrabold text-sm text-white">Топ стикер-паков</h3>
                  <span class="ml-auto text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">по использованию</span>
                </div>
                <div class="divide-y divide-brand-border">
                  <div v-for="(pack, idx) in stickerStats.topPacks.slice(0,10)" :key="pack.id"
                    class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-all">
                    <span class="w-5 text-center text-xs font-black"
                      :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">
                      {{ idx+1 }}
                    </span>
                    <div class="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden border border-white/10"
                      :style="pack.cover_bg_color ? `background:${pack.cover_bg_color}` : 'background:rgba(255,255,255,0.05)'">
                      <img v-if="pack.cover_url" :src="pack.cover_url" class="w-full h-full object-cover" />
                      <div v-else class="w-full h-full flex items-center justify-center text-lg">🎭</div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-bold text-white truncate flex items-center gap-1.5">
                        {{ pack.name }}
                        <span v-if="pack.is_nsfw" class="text-[9px] font-extrabold px-1 py-0.5 rounded bg-rose-500/20 text-rose-400">18+</span>
                      </p>
                      <p class="text-xs text-white/35 truncate">@{{ pack.author?.username ?? '—' }}</p>
                    </div>
                    <div class="text-right flex-shrink-0">
                      <p class="text-sm font-black text-emerald-400">{{ formatNum(pack.use_count) }}</p>
                      <p class="text-[10px] text-white/25">{{ formatNum(pack.downloads_count) }} ск.</p>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Daily usage chart -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="Activity" class="w-4 h-4 text-emerald-400" />
                  <h3 class="font-extrabold text-sm text-white">Использование стикеров</h3>
                  <span class="ml-auto text-[10px] text-white/30">30 дней</span>
                </div>
                <div v-if="stickerStats.dailyUsage.length" class="flex items-end gap-0.5 h-32">
                  <div v-for="(point, idx) in stickerStats.dailyUsage" :key="idx"
                    class="flex-1 flex flex-col items-center gap-1 group/bar cursor-default relative">
                    <div class="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100
                      text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-none z-10">
                      {{ point.value }}
                    </div>
                    <div class="w-full rounded-t transition-all hover:opacity-100 opacity-70 min-h-[2px]"
                      :style="`height:${Math.max(2, (point.value / barMax(stickerStats.dailyUsage)) * 128)}px;
                        background:linear-gradient(to top,#10b981,#34d399)`" />
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-12">Нет данных</p>
              </div>
            </div>

            <!-- By Age / Species / Country charts -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

              <!-- By Age -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="CalendarDays" class="w-4 h-4 text-indigo-400" />
                  <h3 class="font-extrabold text-sm text-white">По возрасту</h3>
                </div>
                <div v-if="stickerStats.byAge.length" class="space-y-2">
                  <div v-for="item in stickerStats.byAge" :key="item.label" class="group">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-white/60 font-semibold">{{ item.label }}</span>
                      <span class="text-white font-black">{{ formatNum(item.value) }}</span>
                    </div>
                    <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                      <div class="h-full rounded-full transition-all"
                        :style="`width:${(item.value/barMax(stickerStats.byAge))*100}%;background:linear-gradient(to right,#6366f1,#8b5cf6)`" />
                    </div>
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-8">Нет данных</p>
              </div>

              <!-- By Species -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="PawPrint" class="w-4 h-4 text-amber-400" />
                  <h3 class="font-extrabold text-sm text-white">По виду</h3>
                </div>
                <div v-if="stickerStats.bySpecies.length" class="space-y-2">
                  <div v-for="item in stickerStats.bySpecies.slice(0,8)" :key="item.label" class="group">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-white/60 font-semibold capitalize truncate max-w-[120px]">{{ item.label }}</span>
                      <span class="text-white font-black">{{ formatNum(item.value) }}</span>
                    </div>
                    <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                      <div class="h-full rounded-full transition-all"
                        :style="`width:${(item.value/barMax(stickerStats.bySpecies))*100}%;background:linear-gradient(to right,#f59e0b,#fbbf24)`" />
                    </div>
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-8">Нет данных</p>
              </div>

              <!-- By Country -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="MapPin" class="w-4 h-4 text-rose-400" />
                  <h3 class="font-extrabold text-sm text-white">По стране</h3>
                </div>
                <div v-if="stickerStats.byCountry.length" class="space-y-2">
                  <div v-for="item in stickerStats.byCountry.slice(0,8)" :key="item.label" class="group">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-white/60 font-semibold truncate max-w-[120px]">{{ item.label }}</span>
                      <span class="text-white font-black">{{ formatNum(item.value) }}</span>
                    </div>
                    <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                      <div class="h-full rounded-full transition-all"
                        :style="`width:${(item.value/barMax(stickerStats.byCountry))*100}%;background:linear-gradient(to right,#ef4444,#f87171)`" />
                    </div>
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-8">Нет данных</p>
              </div>
            </div>

          </template>

          <!-- ─── NETWORK sub-tab ─────────────────────────────────── -->
          <template v-else-if="statsSubTab === 'network' && networkStats">

            <!-- Summary cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">Стикер-паков</p>
                <p class="text-2xl font-black text-white">{{ formatNum(networkStats.stickers.packCount) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">Всего отправок</p>
                <p class="text-2xl font-black text-emerald-400">{{ formatNum(Number(networkStats.stickers.totalUses)) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">Топ страна</p>
                <p class="text-lg font-black text-white truncate">{{ networkStats.usersByCountry[0]?.label ?? '—' }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">Топ вид</p>
                <p class="text-lg font-black text-white truncate capitalize">{{ networkStats.usersBySpecies[0]?.label ?? '—' }}</p>
              </div>
            </div>

            <!-- Charts row 1 -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

              <!-- Registrations history -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="UserPlus" class="w-4 h-4 text-indigo-400" />
                  <h3 class="font-extrabold text-sm text-white">Регистрации</h3>
                  <span class="ml-auto text-[10px] text-white/30">30 дней</span>
                </div>
                <div v-if="networkStats.registrationsHistory.length" class="flex items-end gap-0.5 h-32">
                  <div v-for="(point, idx) in networkStats.registrationsHistory" :key="idx"
                    class="flex-1 flex flex-col items-center group/bar cursor-default relative">
                    <div class="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100
                      text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-none z-10">
                      {{ point.value }}
                    </div>
                    <div class="w-full rounded-t transition-all hover:opacity-100 opacity-70 min-h-[2px]"
                      :style="`height:${Math.max(2,(point.value/barMax(networkStats.registrationsHistory))*128)}px;
                        background:linear-gradient(to top,#6366f1,#8b5cf6)`" />
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-12">Нет данных</p>
              </div>

              <!-- Posts history -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="FileText" class="w-4 h-4 text-sky-400" />
                  <h3 class="font-extrabold text-sm text-white">Посты</h3>
                  <span class="ml-auto text-[10px] text-white/30">30 дней</span>
                </div>
                <div v-if="networkStats.postsHistory.length" class="flex items-end gap-0.5 h-32">
                  <div v-for="(point, idx) in networkStats.postsHistory" :key="idx"
                    class="flex-1 flex flex-col items-center group/bar cursor-default relative">
                    <div class="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100
                      text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-none z-10">
                      {{ point.value }}
                    </div>
                    <div class="w-full rounded-t transition-all hover:opacity-100 opacity-70 min-h-[2px]"
                      :style="`height:${Math.max(2,(point.value/barMax(networkStats.postsHistory))*128)}px;
                        background:linear-gradient(to top,#0ea5e9,#38bdf8)`" />
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-12">Нет данных</p>
              </div>
            </div>

            <!-- Charts row 2: by species / country / age / pronouns -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

              <!-- By Species -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="PawPrint" class="w-4 h-4 text-amber-400" />
                  <h3 class="font-extrabold text-sm text-white">Пользователи по виду</h3>
                </div>
                <div v-if="networkStats.usersBySpecies.length" class="space-y-2.5">
                  <div v-for="item in networkStats.usersBySpecies.slice(0,10)" :key="item.label">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-white/60 font-semibold capitalize truncate max-w-[140px]">{{ item.label }}</span>
                      <span class="text-white font-black">{{ formatNum(item.value) }}</span>
                    </div>
                    <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                      <div class="h-full rounded-full"
                        :style="`width:${(item.value/barMax(networkStats.usersBySpecies))*100}%;background:linear-gradient(to right,#f59e0b,#fbbf24)`" />
                    </div>
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-8">Нет данных</p>
              </div>

              <!-- By Country -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="Globe" class="w-4 h-4 text-emerald-400" />
                  <h3 class="font-extrabold text-sm text-white">Пользователи по стране</h3>
                </div>
                <div v-if="networkStats.usersByCountry.length" class="space-y-2.5">
                  <div v-for="item in networkStats.usersByCountry.slice(0,10)" :key="item.label">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-white/60 font-semibold truncate max-w-[140px]">{{ item.label }}</span>
                      <span class="text-white font-black">{{ formatNum(item.value) }}</span>
                    </div>
                    <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                      <div class="h-full rounded-full"
                        :style="`width:${(item.value/barMax(networkStats.usersByCountry))*100}%;background:linear-gradient(to right,#10b981,#34d399)`" />
                    </div>
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-8">Нет данных</p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

              <!-- By Age -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="CalendarDays" class="w-4 h-4 text-indigo-400" />
                  <h3 class="font-extrabold text-sm text-white">Пользователи по возрасту</h3>
                </div>
                <div v-if="networkStats.usersByAge.length" class="space-y-2.5">
                  <div v-for="item in networkStats.usersByAge" :key="item.label">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-white/60 font-semibold">{{ item.label }}</span>
                      <span class="text-white font-black">{{ formatNum(item.value) }}</span>
                    </div>
                    <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                      <div class="h-full rounded-full"
                        :style="`width:${(item.value/barMax(networkStats.usersByAge))*100}%;background:linear-gradient(to right,#6366f1,#818cf8)`" />
                    </div>
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-8">Нет данных</p>
              </div>

              <!-- By Pronouns -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="Heart" class="w-4 h-4 text-pink-400" />
                  <h3 class="font-extrabold text-sm text-white">Пользователи по местоимениям</h3>
                </div>
                <div v-if="networkStats.usersByPronoun.length" class="space-y-2.5">
                  <div v-for="item in networkStats.usersByPronoun" :key="item.label">
                    <div class="flex items-center justify-between text-xs mb-1">
                      <span class="text-white/60 font-semibold truncate max-w-[140px]">{{ item.label }}</span>
                      <span class="text-white font-black">{{ formatNum(item.value) }}</span>
                    </div>
                    <div class="h-2 rounded-full overflow-hidden" style="background:rgba(255,255,255,0.06)">
                      <div class="h-full rounded-full"
                        :style="`width:${(item.value/barMax(networkStats.usersByPronoun))*100}%;background:linear-gradient(to right,#ec4899,#f472b6)`" />
                    </div>
                  </div>
                </div>
                <p v-else class="text-center text-sm text-white/25 py-8">Нет данных</p>
              </div>
            </div>

            <!-- Top posters + most followed -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

              <!-- Top posters -->
              <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
                <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
                  <BIcon name="Pencil" class="w-4 h-4 text-sky-400" />
                  <h3 class="font-extrabold text-sm text-white">Самые активные авторы</h3>
                </div>
                <div class="divide-y divide-brand-border">
                  <div v-for="(u, idx) in networkStats.topPosters" :key="u.userId"
                    class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-all">
                    <span class="w-5 text-center text-xs font-black"
                      :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">{{ idx+1 }}</span>
                    <img v-if="u.avatarUrl" :src="u.avatarUrl" class="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0" />
                    <div v-else class="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/15 flex items-center justify-center text-xs font-bold text-indigo-300 flex-shrink-0">
                      {{ (u.displayName || u.username || '?')[0].toUpperCase() }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-bold text-white truncate">{{ u.displayName || u.username }}</p>
                      <p class="text-xs text-white/35">@{{ u.username }}</p>
                    </div>
                    <span class="text-sm font-black text-sky-400">{{ formatNum(u.count) }}</span>
                  </div>
                </div>
              </div>

              <!-- Most followed -->
              <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
                <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
                  <BIcon name="Star" class="w-4 h-4 text-yellow-400" />
                  <h3 class="font-extrabold text-sm text-white">Самые популярные</h3>
                  <span class="ml-auto text-[10px] text-white/30">по подписчикам</span>
                </div>
                <div class="divide-y divide-brand-border">
                  <div v-for="(u, idx) in networkStats.mostFollowed" :key="u.userId"
                    class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-all">
                    <span class="w-5 text-center text-xs font-black"
                      :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">{{ idx+1 }}</span>
                    <img v-if="u.avatarUrl" :src="u.avatarUrl" class="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0" />
                    <div v-else class="w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/15 flex items-center justify-center text-xs font-bold text-yellow-300 flex-shrink-0">
                      {{ (u.displayName || u.username || '?')[0].toUpperCase() }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-bold text-white truncate">{{ u.displayName || u.username }}</p>
                      <p class="text-xs text-white/35">@{{ u.username }}</p>
                    </div>
                    <span class="text-sm font-black text-yellow-400">{{ formatNum(u.count) }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Top groups -->
            <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
              <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
                <BIcon name="Users" class="w-4 h-4 text-purple-400" />
                <h3 class="font-extrabold text-sm text-white">Топ групп</h3>
                <span class="ml-auto text-[10px] text-white/30">по участникам</span>
              </div>
              <div class="divide-y divide-brand-border">
                <div v-for="(g, idx) in networkStats.topGroups" :key="g.id"
                  class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.02] transition-all">
                  <span class="w-5 text-center text-xs font-black"
                    :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">{{ idx+1 }}</span>
                  <img v-if="g.avatarUrl" :src="g.avatarUrl" class="w-8 h-8 rounded-xl object-cover border border-white/10 flex-shrink-0" />
                  <div v-else class="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/15 flex items-center justify-center text-xs font-bold text-purple-300 flex-shrink-0">
                    {{ g.name[0]?.toUpperCase() ?? '?' }}
                  </div>
                  <p class="flex-1 text-sm font-bold text-white truncate">{{ g.name }}</p>
                  <span class="text-sm font-black text-purple-400">{{ formatNum(g.memberCount) }}</span>
                </div>
              </div>
            </div>

          </template>

          <!-- Empty state when no data yet -->
          <div v-else-if="!isLoadingStatistics" class="flex flex-col items-center gap-4 py-24 text-white/25">
            <BIcon name="BarChart2" class="w-12 h-12 opacity-30" />
            <p class="text-sm font-semibold">Нет данных</p>
          </div>

        </div>

        <!-- ── Bloomly Updates Tab ─────────────────────────────────────── -->
        <div v-else-if="activeTab === 'updates'" class="space-y-6">

          <!-- Create form -->
          <div class="rounded-3xl border border-brand-border p-6 space-y-4" style="background:#1F223C">
            <div class="flex items-center gap-3 mb-2">
              <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center flex-shrink-0">
                <span class="text-white font-black text-sm select-none">B</span>
              </div>
              <h3 class="font-extrabold text-white">Новое обновление</h3>
              <span class="text-xs text-white/30 ml-auto">Отображается в историях первым</span>
            </div>

            <input
              v-model="newUpdateTitle"
              class="adm-input"
              placeholder="Заголовок (напр. «Версия 1.5 — новые стикеры»)"
              maxlength="120"
            />
            <textarea
              v-model="newUpdateBody"
              class="adm-input resize-none"
              rows="3"
              placeholder="Описание изменений (необязательно)…"
              maxlength="800"
            />
            <div v-if="newUpdateImageUrl" class="flex items-center gap-3 p-3 bg-white/5 border border-white/[0.08] rounded-2xl">
              <img :src="newUpdateImageUrl" class="w-20 h-12 object-cover rounded-xl flex-shrink-0 border border-white/10" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-white/70">Обложка загружена</p>
                <p class="text-[10px] text-white/30 truncate mt-0.5">{{ newUpdateImageUrl }}</p>
              </div>
              <button type="button" @click="newUpdateImageUrl = ''"
                class="w-7 h-7 rounded-lg bg-white/5 hover:bg-rose-500/20 hover:text-rose-400 flex items-center justify-center flex-shrink-0 transition-colors">
                <BIcon name="X" class="w-3.5 h-3.5" />
              </button>
            </div>
            <MediaUpload v-else type="banners" accept="image/*" @uploaded="(urls) => newUpdateImageUrl = urls[0] ?? ''" />
            <button
              @click="createUpdate"
              :disabled="!newUpdateTitle.trim() || isSavingUpdate"
              class="px-6 py-2.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-40"
              style="background:linear-gradient(135deg,#4C67CF,#7c3aed)"
            >
              <span v-if="isSavingUpdate">Публикация…</span>
              <span v-else>Опубликовать обновление</span>
            </button>
          </div>

          <!-- Updates list -->
          <div v-if="isLoadingUpdates" class="flex items-center justify-center py-16">
            <BIcon name="Loader2" class="w-8 h-8 text-white/30 animate-spin" />
          </div>
          <div v-else-if="updates.length === 0" class="flex flex-col items-center gap-4 py-20 text-white/25">
            <BIcon name="Megaphone" class="w-12 h-12 opacity-30" />
            <p class="text-sm font-semibold">Обновлений ещё нет</p>
          </div>
          <div v-else class="space-y-3">
            <div
              v-for="u in updates"
              :key="u.id"
              class="rounded-2xl border p-4 flex gap-4 items-start transition-all"
              :class="u.is_active ? 'border-[#4C67CF]/20 bg-[#4C67CF]/5' : 'border-brand-border opacity-50'"
              style="background:#1F223C"
            >
              <!-- Cover image or logo -->
              <div class="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border border-white/10">
                <img v-if="u.image_url" :src="u.image_url" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center">
                  <span class="text-white font-black text-xl select-none">B</span>
                </div>
              </div>
              <!-- Content -->
              <div class="flex-1 min-w-0">
                <p class="font-bold text-white text-sm">{{ u.title }}</p>
                <p v-if="u.body" class="text-xs text-white/50 mt-0.5 line-clamp-2">{{ u.body }}</p>
                <p class="text-[11px] text-white/25 mt-1">{{ formatDate(u.created_at) }}</p>
              </div>
              <!-- Actions -->
              <div class="flex flex-col gap-2 flex-shrink-0">
                <button
                  @click="toggleUpdate(u.id, !u.is_active)"
                  class="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                  :class="u.is_active
                    ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                    : 'bg-white/[0.06] text-white/40 hover:bg-white/10'"
                >
                  {{ u.is_active ? 'Активно' : 'Скрыто' }}
                </button>
                <button
                  @click="deleteUpdate(u.id)"
                  class="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                >
                  Удалить
                </button>
              </div>
            </div>
          </div>

        </div>

        <!-- ── GROUPS & EVENTS ────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'groups'">
          <div v-if="isLoadingGroupsOverview" class="space-y-5">
            <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <div v-for="n in 6" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
            </div>
            <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
          </div>
          <template v-else-if="groupsOverview">
            <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">Группы</h2>
            <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
              <router-link v-for="g in groupsOverview.groups" :key="g.id" :to="`/groups/${g.slug}`" target="_blank"
                class="rounded-2xl border border-brand-border bg-brand-card p-4 hover:border-brand-accent/30 transition-all overflow-hidden relative">
                <div class="absolute top-0 left-0 right-0 h-[3px] bg-brand-accent" />
                <p class="font-bold text-white text-sm truncate mt-1">{{ g.name }}</p>
                <p class="text-xs text-white/35 mt-0.5">{{ GROUP_TYPE_LABEL[g.type] ?? g.type }}</p>
                <p class="text-xs text-white/50 mt-2 flex items-center gap-1.5">
                  <BIcon name="Users" class="w-3.5 h-3.5" /> {{ formatNum(g.memberCount) }} участников
                </p>
              </router-link>
              <p v-if="!groupsOverview.groups.length" class="col-span-full text-center text-sm text-white/25 py-10">Групп пока нет</p>
            </div>

            <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">Ближайшие события</h2>
            <div class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden">
              <div class="hidden lg:grid gap-3 px-5 py-3 border-b border-brand-border grid-cols-[2fr_1.5fr_1fr_1fr_0.8fr]">
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Событие</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Группа</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Дата</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Участники</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Статус</span>
              </div>
              <div v-if="!groupsOverview.events.length" class="flex flex-col items-center gap-3 py-16 text-white/25">
                <BIcon name="CalendarDays" class="w-10 h-10 opacity-40" />
                <p class="text-sm font-semibold">Событий нет</p>
              </div>
              <div v-else class="divide-y divide-brand-border">
                <router-link v-for="e in groupsOverview.events" :key="e.id" :to="`/groups/${e.groupSlug}`" target="_blank"
                  class="grid grid-cols-1 lg:grid-cols-[2fr_1.5fr_1fr_1fr_0.8fr] gap-2 lg:gap-3 items-center px-5 py-3.5 hover:bg-white/[0.03] transition-all">
                  <p class="text-sm font-bold text-white truncate">{{ e.title }}</p>
                  <p class="text-xs text-white/50 truncate">{{ e.groupName }}</p>
                  <p class="text-xs text-white/50">{{ formatDate(e.startsAt) }}</p>
                  <p class="text-xs text-white/70 font-semibold">{{ formatNum(e.attendeeCount) }}</p>
                  <span class="text-[10px] font-extrabold px-2 py-1 rounded-full w-fit"
                    :class="e.isUpcoming ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/5 text-white/30'">
                    {{ e.isUpcoming ? 'Скоро' : 'Прошло' }}
                  </span>
                </router-link>
              </div>
            </div>
          </template>
        </div>

        <!-- ── FINANCE & PREMIUM ──────────────────────────────────────── -->
        <div v-else-if="activeTab === 'finance'">
          <div v-if="isLoadingPremiumOverview" class="space-y-5">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div v-for="n in 4" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
            </div>
            <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
          </div>
          <template v-else-if="premiumOverview">
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">С подпиской</p>
                <p class="text-2xl font-black text-white">{{ formatNum(premiumOverview.total - freeUserCount) }}</p>
                <p class="text-xs font-semibold text-brand-accent mt-1">из {{ formatNum(premiumOverview.total) }} пользователей</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">Доля Premium</p>
                <p class="text-2xl font-black text-white">{{ premiumShare }}%</p>
                <p class="text-xs font-semibold text-emerald-400 mt-1">от всех пользователей</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">Топ уровень</p>
                <p class="text-2xl font-black text-white">{{ tierLabel(paidTierBreakdown[0]?.tier) ?? '—' }}</p>
                <p class="text-xs font-semibold text-amber-400 mt-1">{{ formatNum(paidTierBreakdown[0]?.count ?? 0) }} подписчиков</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">Без подписки</p>
                <p class="text-2xl font-black text-white">{{ formatNum(freeUserCount) }}</p>
                <p class="text-xs font-semibold text-white/40 mt-1">Free-тариф</p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">Разбивка по уровням Premium</h3>
                <div v-for="t in paidTierBreakdown" :key="t.tier" class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-semibold" :style="`color:${tierColor(t.tier)}`">{{ tierLabel(t.tier) }}</span>
                    <span class="text-xs font-bold text-white">{{ formatNum(t.count) }} подписчиков</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full" :style="`width:${Math.round((t.count / barMax(paidTierBreakdown.map((x:any)=>({value:x.count})))) * 100)}%;background:${tierColor(t.tier)}`" />
                  </div>
                </div>
                <p v-if="!paidTierBreakdown.length" class="text-xs text-white/25 text-center py-6">Пока нет платных подписчиков</p>
              </div>

              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">Подписчики Premium</h3>
                <div v-if="!premiumOverview.topSubscribers.length" class="text-xs text-white/25 text-center py-6">Пока никто не оформил подписку</div>
                <router-link v-for="u in premiumOverview.topSubscribers" :key="u.id" :to="`/profile/${u.username}`" target="_blank"
                  class="flex items-center gap-2.5 py-2 hover:bg-white/[0.03] rounded-xl transition-all -mx-2 px-2">
                  <img v-if="u.avatar_url" :src="u.avatar_url" class="w-8 h-8 rounded-full object-cover border border-white/10 flex-shrink-0" />
                  <div v-else class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    :style="`background:${tierColor(u.subscription_tier)}20;color:${tierColor(u.subscription_tier)}`">
                    {{ (u.display_name || u.username || '?')[0].toUpperCase() }}
                  </div>
                  <span class="text-sm font-semibold text-white truncate flex-1">{{ u.display_name || u.username }}</span>
                  <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full flex-shrink-0"
                    :style="`background:${tierColor(u.subscription_tier)}20;color:${tierColor(u.subscription_tier)}`">
                    {{ tierLabel(u.subscription_tier) }}
                  </span>
                </router-link>
              </div>
            </div>

            <!-- Dealers' Den turnover — honestly labelled: the marketplace takes
                 no commission today, so this is buyer↔seller turnover (GMV),
                 not platform income. -->
            <div class="rounded-2xl border border-brand-border bg-brand-card p-5 mt-5">
              <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
                <div>
                  <h3 class="font-extrabold text-white text-sm">Оборот Dealers' Den</h3>
                  <p class="text-xs text-white/40 mt-0.5">Сумма проданных лотов по месяцам — маркетплейс не берёт комиссию, это не доход платформы</p>
                </div>
                <span class="text-xs font-bold px-3 py-1.5 rounded-full bg-brand-accent/15 text-brand-accent flex-shrink-0">
                  ${{ formatNum(premiumOverview.dealersDen.totalGmv) }} всего · {{ premiumOverview.dealersDen.soldCount }} продаж
                </span>
              </div>
              <div v-if="gmvMonths.length" class="flex items-end gap-1.5 h-28 mt-4">
                <div v-for="(m, idx) in gmvMonths" :key="idx"
                  class="flex-1 flex flex-col items-center gap-1 group/bar cursor-default relative">
                  <div class="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100
                    text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-none">
                    ${{ m.total }} · {{ m.count }} шт.
                  </div>
                  <div class="w-full rounded-t-lg transition-all hover:opacity-100 opacity-80 bg-brand-accent"
                    :style="`height:${Math.max(4, (m.total / gmvMax) * 100)}px`" />
                </div>
              </div>
              <div v-if="gmvMonths.length" class="flex justify-between mt-2 px-0.5">
                <span class="text-[10px] text-white/30">{{ formatMonthShort(gmvMonths[0].month) }}</span>
                <span class="text-[10px] text-white/30">{{ formatMonthShort(gmvMonths[gmvMonths.length-1].month) }}</span>
              </div>
              <p v-else class="text-xs text-white/25 text-center py-8">Продаж пока не было</p>
            </div>
          </template>
        </div>

        <!-- ── TEAM & ROLES ───────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'team'">
          <div class="flex items-center justify-end mb-4">
            <button v-if="isOwnerRole" @click="showInviteForm = !showInviteForm"
              class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-white shadow-lg transition-all"
              style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 16px rgba(76,103,207,0.3)">
              <BIcon name="UserPlus" class="w-3.5 h-3.5" /> Пригласить в команду
            </button>
          </div>

          <Transition name="filter-expand">
            <div v-if="showInviteForm" class="rounded-2xl border border-brand-border bg-brand-card p-5 mb-5">
              <h3 class="font-extrabold text-white text-sm mb-3">Новый сотрудник</h3>
              <div class="flex flex-col sm:flex-row gap-2">
                <input v-model="inviteIdentifier" placeholder="Email или @username" class="adm-input flex-1" />
                <select v-model="inviteRole" class="adm-input sm:w-44">
                  <option value="moderator">Модератор</option>
                  <option value="admin">Администратор</option>
                  <option value="owner">Владелец</option>
                </select>
                <button @click="inviteToStaff" :disabled="isInviting || !inviteIdentifier.trim()"
                  class="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all flex-shrink-0"
                  style="background:linear-gradient(135deg,#4C67CF,#31458F)">
                  {{ isInviting ? '...' : 'Добавить' }}
                </button>
              </div>
              <p v-if="inviteError" class="text-xs text-rose-400 mt-2">{{ inviteError }}</p>
            </div>
          </Transition>

          <div class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden">
            <div class="hidden lg:grid gap-3 px-5 py-3 border-b border-brand-border grid-cols-[2fr_1fr_1fr_1.2fr_1fr]">
              <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Сотрудник</span>
              <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Роль</span>
              <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Статус</span>
              <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">Последняя активность</span>
              <span></span>
            </div>
            <div v-if="isLoadingStaff" class="p-5 space-y-3">
              <div v-for="n in 4" :key="n" class="h-10 rounded-xl bg-white/5 animate-pulse" />
            </div>
            <div v-else-if="!staff.length" class="flex flex-col items-center gap-3 py-16 text-white/25">
              <BIcon name="ShieldCheck" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">В команде пока только вы</p>
            </div>
            <div v-else class="divide-y divide-brand-border">
              <div v-for="m in staff" :key="m.id"
                class="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1.2fr_1fr] gap-2 lg:gap-3 items-center px-5 py-3.5">
                <div class="flex items-center gap-2.5 min-w-0">
                  <img v-if="m.avatar_url" :src="m.avatar_url" class="w-9 h-9 rounded-full object-cover border border-white/10 flex-shrink-0" />
                  <div v-else class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    :style="`background:${roleColor(m.role)}20;color:${roleColor(m.role)}`">
                    {{ (m.display_name || m.username || '?')[0].toUpperCase() }}
                  </div>
                  <div class="min-w-0">
                    <p class="font-bold text-sm text-white truncate">{{ m.display_name || m.username }}</p>
                    <p class="text-xs text-white/35 truncate">{{ m.email }}</p>
                  </div>
                </div>
                <span class="text-xs font-extrabold px-2.5 py-1 rounded-full w-fit"
                  :style="`background:${roleColor(m.role)}20;color:${roleColor(m.role)}`">
                  {{ roleLabel(m.role) }}
                </span>
                <span class="text-xs font-extrabold px-2.5 py-1 rounded-full w-fit"
                  :class="m.frozen_at ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'">
                  {{ m.frozen_at ? 'Отстранён' : 'Активен' }}
                </span>
                <span class="text-xs text-white/50">{{ relativeLastSeen(m.last_seen_at) }}</span>
                <div class="flex items-center gap-1.5 justify-start lg:justify-end">
                  <button v-if="m.frozen_at" @click="reactivateStaff(m)" title="Вернуть в строй"
                    class="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-all">
                    <BIcon name="ShieldCheck" class="w-3.5 h-3.5" />
                  </button>
                  <button v-else @click="suspendStaff(m)" title="Приостановить"
                    class="w-8 h-8 rounded-full bg-white/5 text-white/40 hover:bg-white/10 hover:text-white flex items-center justify-center transition-all">
                    <BIcon name="Snowflake" class="w-3.5 h-3.5" />
                  </button>
                  <button v-if="isOwnerRole" @click="removeFromStaff(m)" title="Убрать из команды"
                    class="w-8 h-8 rounded-full bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-all">
                    <BIcon name="UserMinus" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── NOTIFICATIONS / BROADCASTS ─────────────────────────────── -->
        <div v-else-if="activeTab === 'broadcasts'">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
              <h3 class="font-extrabold text-white text-sm mb-4">Новая рассылка</h3>
              <div class="space-y-3">
                <input v-model="broadcastTitle" placeholder="Заголовок уведомления" class="adm-input" />
                <textarea v-model="broadcastBody" placeholder="Текст сообщения..." class="adm-input resize-none h-28" />
                <select v-model="broadcastAudience" class="adm-input">
                  <option value="all">Все пользователи</option>
                  <option value="premium">Premium-подписчики</option>
                  <option value="new">Новые пользователи (7 дн.)</option>
                  <option value="staff">Модераторы</option>
                </select>
                <button @click="sendBroadcast" :disabled="isSendingBroadcast || !broadcastTitle.trim() || !broadcastBody.trim()"
                  class="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40 transition-all shadow-lg"
                  style="background:linear-gradient(135deg,#4C67CF,#8b5cf6)">
                  <BIcon name="Send" class="w-4 h-4" /> {{ isSendingBroadcast ? 'Отправка...' : 'Отправить рассылку' }}
                </button>
              </div>
            </div>

            <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
              <h3 class="font-extrabold text-white text-sm mb-4">История рассылок</h3>
              <div v-if="isLoadingBroadcasts" class="space-y-3">
                <div v-for="n in 3" :key="n" class="h-12 rounded-xl bg-white/5 animate-pulse" />
              </div>
              <div v-else-if="!broadcasts.length" class="text-xs text-white/25 text-center py-10">Рассылок ещё не было</div>
              <div v-else class="divide-y divide-brand-border -mx-1">
                <div v-for="b in broadcasts" :key="b.id" class="py-3 px-1">
                  <p class="font-bold text-sm text-white">{{ b.title }}</p>
                  <p class="text-xs text-white/40 mt-0.5">{{ AUDIENCE_LABEL[b.audience] ?? b.audience }} · {{ formatDate(b.created_at) }} · {{ b.recipient_count }} получателей · {{ b.opens }} открытий</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── LOGS & SETTINGS ────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'settings'">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="rounded-2xl border border-brand-border bg-brand-card p-5 h-fit">
              <h3 class="font-extrabold text-white text-sm mb-4">Настройки платформы</h3>
              <div v-if="isLoadingSettings" class="space-y-3">
                <div v-for="n in 3" :key="n" class="h-10 rounded-xl bg-white/5 animate-pulse" />
              </div>
              <div v-else-if="siteSettings" class="space-y-4">
                <div v-for="s in SETTING_META" :key="s.key" class="flex items-center justify-between gap-4">
                  <div class="min-w-0">
                    <p class="text-sm font-bold text-white">{{ s.label }}</p>
                    <p class="text-xs text-white/40 mt-0.5">{{ s.desc }}</p>
                  </div>
                  <button @click="toggleSetting(s.key)" class="w-11 h-6 rounded-full flex-shrink-0 transition-all relative"
                    :class="siteSettings[s.key] ? 'bg-brand-accent' : 'bg-white/10'">
                    <span class="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" :class="siteSettings[s.key] ? 'left-[22px]' : 'left-0.5'" />
                  </button>
                </div>
              </div>
            </div>

            <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
              <h3 class="font-extrabold text-white text-sm mb-4">Журнал действий</h3>
              <div v-if="isLoadingAuditLogs" class="space-y-3">
                <div v-for="n in 5" :key="n" class="h-10 rounded-xl bg-white/5 animate-pulse" />
              </div>
              <div v-else-if="!auditLogs.length" class="text-xs text-white/25 text-center py-10">Действий пока не было</div>
              <div v-else class="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                <div v-for="l in auditLogs" :key="l.id" class="flex items-start gap-3">
                  <div class="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <BIcon :name="AUDIT_ACTION_ICON[l.action] ?? 'Activity'" class="w-3.5 h-3.5 text-white/50" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm text-white/80"><span class="font-bold text-white">{{ auditActorName(l) }}</span> {{ auditActionText(l) }}</p>
                    <p class="text-[11px] text-white/30 mt-0.5">{{ formatDate(l.created_at) }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── INFRASTRUCTURE ─────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'infra'">
          <div v-if="isLoadingInfra" class="space-y-5">
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div v-for="n in 3" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
            </div>
            <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
          </div>
          <template v-else-if="infraOverview">
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">S3 занято</p>
                <p class="text-2xl font-black text-white">{{ formatBytes(infraOverview.storage.totalBytes) }}</p>
                <p class="text-xs font-semibold text-brand-accent mt-1">{{ formatNum(infraOverview.storage.totalObjects) }} файлов</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">Стикеров в системе</p>
                <p class="text-2xl font-black text-white">{{ formatNum(infraOverview.stickers.totalUses) }}</p>
                <p class="text-xs font-semibold text-emerald-400 mt-1">в {{ infraOverview.stickers.packCount }} паках использований</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">Лоты Dealers' Den</p>
                <p class="text-2xl font-black text-white">{{ infraOverview.dealersDen.activeListings }}</p>
                <p class="text-xs font-semibold text-amber-400 mt-1">{{ infraOverview.dealersDen.soldThisMonthCount }} продаж за месяц</p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">Хранилище S3</h3>
                <p class="text-xs text-white/40 mb-3">{{ formatBytes(infraOverview.storage.totalBytes) }} в {{ infraOverview.storage.totalObjects }} файлах</p>
                <div v-for="f in infraOverview.storage.byFolder" :key="f.folder" class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-semibold text-white/60">{{ FOLDER_LABEL[f.folder] ?? f.folder }}</span>
                    <span class="text-xs font-bold text-white">{{ formatBytes(f.bytes) }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full bg-brand-accent" :style="`width:${Math.round((f.bytes / infraOverview.storage.totalBytes) * 100)}%`" />
                  </div>
                </div>
                <p v-if="!infraOverview.storage.byFolder.length" class="text-xs text-white/25 text-center py-6">Хранилище пусто</p>
              </div>

              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">Топ стикерпаков</h3>
                <div v-for="p in infraOverview.stickers.topPacks" :key="p.name" class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-semibold text-white/60 truncate">{{ p.name }}</span>
                    <span class="text-xs font-bold text-white flex-shrink-0">{{ formatNum(p.uses) }} исп.</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full bg-brand-purple" :style="`width:${Math.round((p.uses / (infraOverview.stickers.topPacks[0]?.uses || 1)) * 100)}%`" />
                  </div>
                </div>
                <p v-if="!infraOverview.stickers.topPacks.length" class="text-xs text-white/25 text-center py-6">Стикерпаков пока нет</p>
              </div>
            </div>
          </template>
        </div>

      </div>
      </Transition>
      </main>
    </div>
  </div>
</template>

<style scoped>
.filter-expand-enter-active, .filter-expand-leave-active { transition: all 0.2s ease; }
.filter-expand-enter-from, .filter-expand-leave-to { opacity: 0; transform: translateY(-8px); }

.tab-fade-enter-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.tab-fade-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.tab-fade-enter-from { opacity: 0; transform: translateY(6px); }
.tab-fade-leave-to { opacity: 0; transform: translateY(-4px); }

.fade-pop-enter-active { transition: opacity 0.15s ease, transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1); }
.fade-pop-leave-active { transition: opacity 0.1s ease, transform 0.1s ease; }
.fade-pop-enter-from, .fade-pop-leave-to { opacity: 0; transform: scale(0.95) translateY(-4px); }

.adm-input {
  @apply w-full rounded-2xl px-4 py-2.5 text-sm text-white outline-none transition-all;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  color: white;
}
.adm-input::placeholder { color: rgba(255,255,255,0.25); }
.adm-input:focus { border-color: rgba(76,103,207,0.45); background: rgba(255,255,255,0.08); }

/* Slim, themed scrollbar for the sidebar nav */
.adm-scroll::-webkit-scrollbar { width: 5px; }
.adm-scroll::-webkit-scrollbar-track { background: transparent; }
.adm-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 999px; }
.adm-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.16); }
.adm-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; }

/* Faint gradient hairline under the top bar for depth */
.adm-header::after {
  content: '';
  position: absolute;
  left: 0; right: 0; bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(76,103,207,0.3), rgba(139,92,246,0.2), transparent);
}
</style>
