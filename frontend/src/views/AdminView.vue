<script setup lang="ts">
import { safeHref } from '@/utils/safeHref'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
const langStore = useLangStore()
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import api from '../api'
import BIcon from '../components/BIcon.vue'
import MediaUpload from '../components/MediaUpload.vue'
import PostLightbox from '../components/PostLightbox.vue'
import ResolveReportModal from '../components/ResolveReportModal.vue'
import StickerPackDetailModal from '../components/StickerPackDetailModal.vue'
import { useConfirm } from '@/composables/useConfirm'
import { verTypeIconUrl } from '@/lib/verificationIcons'

const router = useRouter()
const auth = useAuthStore()
const { confirmDialog } = useConfirm()

// ── Staff role hierarchy: user < moderator < admin < owner ──────────────
const ROLE_RANK: Record<string, number> = { user: 0, moderator: 1, admin: 2, owner: 3 }
const myRole = computed<string>(() => (auth.user as any)?.role ?? 'user')
const myRoleRank = computed(() => ROLE_RANK[myRole.value] ?? 0)
const isOwnerRole = computed(() => myRole.value === 'owner')
const isAdminPlus = computed(() => myRoleRank.value >= ROLE_RANK.admin)
const roleLabel = (role: string) => ({ owner: langStore.t.roleOwner, admin: langStore.t.roleAdmin, moderator: langStore.t.roleModerator, user: langStore.t.roleUser }[role] ?? role)

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
const activeTab = ref<'overview' | 'users' | 'posts' | 'reports' | 'support' | 'ads' | 'verification' | 'frames' | 'automod' | 'statistics' | 'updates' | 'groups' | 'finance' | 'settings'>('overview')

// Users tab has four views: the user list, team & roles, frozen accounts, banned accounts (all merged in)
const usersViewMode = ref<'all' | 'team' | 'frozen' | 'archived'>('all')
// Reports tab has two views: user reports, or ban/freeze appeals (merged in)
const reportsViewMode = ref<'reports' | 'appeals'>('reports')
// Ads tab has two views: paid ad slots, or promo banners (merged in)
const adsViewMode = ref<'ads' | 'banners'>('ads')
// Updates ("Коммуникация") tab has two views: changelog posts, or push broadcasts (merged in)
const commsViewMode = ref<'updates' | 'broadcasts'>('updates')

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

const userSortOptions = computed(() => [
  { value: 'privilege',    label: langStore.t.adminSortPrivilege },
  { value: 'newest',       label: langStore.t.adminSortNewest },
  { value: 'oldest',       label: langStore.t.adminSortOldest },
  { value: 'posts',        label: langStore.t.adminSortByPosts },
  { value: 'followers',    label: langStore.t.adminSortByFollowers },
  { value: 'subscription', label: langStore.t.adminSortBySubscription },
  { value: 'username',     label: langStore.t.adminSortByUsername },
])
const userSortLabel = computed(() => userSortOptions.value.find(o => o.value === userSort.value)?.label ?? langStore.t.bookmarksSort)
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
  if (user.deceased_at) return { label: langStore.t.adminStatusDeceased, color: '#94a3b8' }
  if (user.frozen_at) return { label: langStore.t.adminStatusFrozen, color: '#38bdf8' }
  return { label: langStore.t.activeLabel, color: '#66C770' }
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
const userColumns = computed(() => [
  { label: langStore.t.roleUser,             values: ['username', 'username_desc'] },
  { label: 'Email',                          values: ['email_asc', 'email_desc'] },
  { label: langStore.t.adminColStatus,       values: ['status_desc', 'status_asc'] },
  { label: langStore.t.adminColRegistered,   values: ['newest', 'oldest'] },
  { label: langStore.t.posts,                values: ['posts', 'posts_asc'] },
  { label: langStore.t.followers,            values: ['followers', 'followers_asc'] },
  { label: langStore.t.adminColVerification,  values: ['verification_desc', 'verification_asc'] },
])
const userColumnDirection = (col: typeof userColumns.value[number]): 'asc' | 'desc' | null => {
  const idx = (col.values as readonly string[]).indexOf(userSort.value)
  return idx === 0 ? 'desc' : idx === 1 ? 'asc' : null
}
const toggleUserColumnSort = (col: typeof userColumns.value[number]) => {
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
const tierMenuOptions = computed(() => [
  { value: 'free',     label: langStore.t.adminNoSubscription },
  { value: 'lite',     label: 'Lite' },
  { value: 'pro',      label: 'Pro' },
  { value: 'business', label: 'Business' },
])
const roleMenuOptions = computed(() => [
  { value: 'user',      label: langStore.t.roleUser },
  { value: 'moderator', label: langStore.t.roleModerator },
  { value: 'admin',     label: langStore.t.roleAdmin },
  { value: 'owner',     label: langStore.t.roleOwner },
])
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
  if (!(await confirmDialog(langStore.t.adminConfirmDeleteUser, { danger: true }))) return
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
  if (!(await confirmDialog(langStore.t.adminConfirmRestoreUser))) return
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
  if (!(await confirmDialog(langStore.t.adminConfirmDeletePost, { danger: true }))) return
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

const REPORT_TARGET_LABEL = computed<Record<string, string>>(() => ({ post: langStore.t.adminReportTargetPost, group: langStore.t.adminReportTargetGroup, listing: langStore.t.adminReportTargetListing, message: langStore.t.messageBtn, user: langStore.t.viewProfile }))

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

const SUPPORT_TYPE_LABEL = computed<Record<string, string>>(() => ({ bug: langStore.t.helpTypeShortBug, feedback: langStore.t.helpTypeShortFeedback, question: langStore.t.helpTypeShortQuestion, other: langStore.t.other }))
const SUPPORT_STATUS_LABEL = computed<Record<string, string>>(() => ({ open: langStore.t.helpStatusOpen, in_progress: langStore.t.helpStatusInProgress, resolved: langStore.t.helpStatusResolved, closed: langStore.t.helpStatusClosed }))
const SUPPORT_STATUS_COLOR: Record<string, string> = { open: '#f59e0b', in_progress: '#38bdf8', resolved: '#10b981', closed: '#6b7280' }

const supportSenderLabel = (m: any) => {
  if (m.sender_type === 'admin') return `${langStore.t.adminSenderAdmin}${m.sender?.username ? ` (@${m.sender.username})` : ''}`
  if (m.sender_type === 'external') return langStore.t.adminSenderExternal
  return `${langStore.t.adminSenderUser}${m.sender?.username ? ` (@${m.sender.username})` : ''}`
}

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
  if (!(await confirmDialog(langStore.t.adminConfirmDeleteAd, { danger: true }))) return
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
  const reason = window.prompt(langStore.t.adminReasonPromptLabel) || undefined
  reviewVerRequest(id, 'reject', reason)
}

const evidenceLightbox = ref<{ images: string[]; start: number } | null>(null)
const openEvidenceLightbox = (images: string[], start: number) => { evidenceLightbox.value = { images, start } }

// ── Avatar frame submissions ─────────────────────────────────────────
const frameSubmissions = ref<any[]>([])
const frameFilter = ref('pending')
const isLoadingFrames = ref(false)

const fetchFrameSubmissions = async () => {
  isLoadingFrames.value = true
  try {
    const params: any = { page: 1 }
    if (frameFilter.value) params.status = frameFilter.value
    const res = await api.get('/admin/avatar-frames', { params })
    if (res.data.success) frameSubmissions.value = res.data.data.submissions
  } catch {} finally { isLoadingFrames.value = false }
}

const reviewFrameSubmission = async (id: string, action: 'approve' | 'reject', reason?: string) => {
  try {
    await api.patch(`/admin/avatar-frames/${id}`, { action, reason })
    frameSubmissions.value = frameSubmissions.value.filter(f => f.id !== id)
  } catch {}
}

// Same reasoning as rejectVerRequest above — window.prompt must be called from script.
const rejectFrameSubmission = (id: string) => {
  const reason = window.prompt(langStore.t.adminFrameRejectPrompt) || undefined
  reviewFrameSubmission(id, 'reject', reason)
}

const postMediaLightbox = ref<{ images: string[]; start: number } | null>(null)
const openPostMediaLightbox = (images: string[], start: number) => { postMediaLightbox.value = { images, start } }

const verTypeLabels = computed<Record<string, string>>(() => ({
  artist: langStore.t.verTypeArtist,
  master: langStore.t.verTypeMaster,
  fursuiter: langStore.t.verTypeFursuiter,
  popular: langStore.t.verTypePopular,
  writer: langStore.t.verTypeWriter,
  organizer: langStore.t.verTypeOrganizer,
  event: langStore.t.verTypeEvent,
  photographer: langStore.t.verTypePhotographer,
  programmer: langStore.t.verTypeProgrammer,
}))
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
  const reason = prompt(langStore.t.adminFreezeReasonPrompt) ?? ''
  if (!reason.trim()) return
  try {
    await api.post(`/admin/users/${userId}/freeze`, { reason })
    const u = users.value.find(u => u.id === userId)
    if (u) u.frozen_at = new Date().toISOString()
    if (activeTab.value === 'users' && usersViewMode.value === 'frozen') await fetchFrozenUsers()
  } catch {}
}

const markDeceased = async (userId: string) => {
  const note = prompt(langStore.t.adminOptionalNotePrompt) ?? undefined
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
    if (e?.response?.data?.code === 'LIMIT') bannerError.value = langStore.t.adminBannerLimitReached
    else bannerError.value = langStore.t.adminSaveError
  }
}

const deleteBanner = async (id: string) => {
  if (!(await confirmDialog(langStore.t.adminConfirmDeleteBanner, { danger: true }))) return
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
const statsSubTab = ref<'stickers' | 'network' | 'infra'>('stickers')

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

const packThumb = (pack: any) => pack.cover_url || pack.stickers?.[pack.cover_sticker_idx ?? 0] || pack.stickers?.[0] || ''

// ── Sticker pack detail modal ───────────────────────────────────────────
const openedPackId = ref<string | null>(null)
const openStickerPackDetail = (packId: string) => { openedPackId.value = packId }
const closeStickerPackDetail = () => { openedPackId.value = null }

// ── Groups & Events ─────────────────────────────────────────────────────
const groupsOverview = ref<any>(null)
const isLoadingGroupsOverview = ref(false)
const GROUP_TYPE_LABEL = computed<Record<string, string>>(() => ({
  event: langStore.t.catEvent, creative: langStore.t.adminGroupTypeCreative, artist: langStore.t.verTypeArtist, static: langStore.t.adminGroupTypeStatic,
  news: langStore.t.adminGroupTypeNews, shop: langStore.t.shop, community: langStore.t.adminGroupTypeCommunity, brand: langStore.t.adminGroupTypeBrand,
}))
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
    inviteError.value = e?.response?.data?.error?.message || langStore.t.userNotFound
  } finally { isInviting.value = false }
}

const removeFromStaff = async (member: any) => {
  if (!(await confirmDialog(`${langStore.t.adminConfirmRemoveFromTeamPrefix}${member.display_name || member.username}${langStore.t.adminConfirmRemoveFromTeamSuffix}`, { danger: true }))) return
  try {
    await api.patch(`/admin/users/${member.id}/role`, { role: 'user' })
    staff.value = staff.value.filter(s => s.id !== member.id)
  } catch {}
}

const suspendStaff = async (member: any) => {
  try {
    await api.post(`/admin/users/${member.id}/freeze`, { reason: langStore.t.adminSuspendedByTeamPanelReason })
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
  if (!d) return langStore.t.adminNeverLabel
  const diffMs = Date.now() - new Date(d).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return langStore.t.adminJustNowLabel
  if (min < 60) return `${min}${langStore.t.adminMinutesAgoSuffix}`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs}${langStore.t.adminHoursAgoSuffix}`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}${langStore.t.adminDaysAgoSuffix}`
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

const AUDIENCE_LABEL = computed<Record<string, string>>(() => ({ all: langStore.t.adminAudienceAll, premium: langStore.t.adminAudiencePremium, new: langStore.t.adminAudienceNew, staff: langStore.t.adminAudienceStaff }))

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

const SETTING_META = computed<{ key: 'open_registration' | 'automod_enabled' | 'maintenance_mode'; label: string; desc: string }[]>(() => [
  { key: 'open_registration', label: langStore.t.adminSettingOpenRegistration, desc: langStore.t.adminSettingOpenRegistrationDesc },
  { key: 'automod_enabled',   label: langStore.t.adminSettingAutoModAI,        desc: langStore.t.adminSettingAutoModAIDesc },
  { key: 'maintenance_mode',  label: langStore.t.adminSettingMaintenanceMode,  desc: langStore.t.adminSettingMaintenanceModeDesc },
])

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
const AUDIT_ACTION_LABEL = computed<Record<string, (l: any) => string>>(() => ({
  ban: (l) => `${langStore.t.auditActionBan} @${l.user?.username}`,
  unban: (l) => `${langStore.t.auditActionUnban} @${l.user?.username}`,
  freeze: (l) => `${langStore.t.auditActionFreeze} @${l.user?.username}`,
  unfreeze: (l) => `${langStore.t.auditActionUnfreeze} @${l.user?.username}`,
  warn: (l) => `${langStore.t.auditActionWarn} @${l.user?.username}`,
  clear_warns: (l) => `${langStore.t.auditActionClearWarns} @${l.user?.username}`,
  delete_post: (l) => `${langStore.t.auditActionDeletePost} @${l.user?.username}`,
  pin_post: (l) => `${langStore.t.auditActionPinPost} @${l.user?.username}`,
  unpin_post: (l) => `${langStore.t.auditActionUnpinPost} @${l.user?.username}`,
  role_change: (l) => `${langStore.t.auditActionRoleChange} @${l.user?.username}`,
  subscription_change: (l) => `${langStore.t.auditActionSubscriptionChange} @${l.user?.username}`,
  resolve_report: () => langStore.t.auditActionResolveReport,
  dismiss_report: () => langStore.t.auditActionDismissReport,
  approve_ad: () => langStore.t.auditActionApproveAd,
  reject_ad: () => langStore.t.auditActionRejectAd,
  activate_banner: () => langStore.t.auditActionActivateBanner,
  deactivate_banner: () => langStore.t.auditActionDeactivateBanner,
  settings_change: (l) => l.reason,
  verify_profile: (l) => `${langStore.t.auditActionVerifyProfile} @${l.user?.username}`,
  reject_verification: (l) => `${langStore.t.auditActionRejectVerification} @${l.user?.username}`,
}))
const auditActionText = (l: any) => (AUDIT_ACTION_LABEL.value[l.action] ?? (() => l.reason))(l)
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
  const units = [langStore.t.adminUnitBytes, langStore.t.adminUnitKB, langStore.t.adminUnitMB, langStore.t.adminUnitGB, langStore.t.adminUnitTB]
  if (!bytes) return `0 ${units[0]}`
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`
}
const FOLDER_LABEL = computed<Record<string, string>>(() => ({
  posts: langStore.t.adminFolderPostImages, avatars: langStore.t.adminFolderAvatars, banners: langStore.t.adminFolderBanners, stickers: langStore.t.stickers,
  video: langStore.t.adminFolderVideo, stories: langStore.t.adminFolderStories, other: langStore.t.other, messages: langStore.t.adminFolderDmAttachments,
  backgrounds: langStore.t.adminFolderProfileBackgrounds, fursona: langStore.t.adminFolderFursonaPhotos, fursuit: langStore.t.fursuitPhotoLabel, comments: langStore.t.adminFolderCommentAttachments,
}))

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
  if (!(await confirmDialog(langStore.t.adminConfirmDeleteUpdate, { danger: true }))) return
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
const switchTab = (tab: typeof activeTab.value, opts?: { usersView?: typeof usersViewMode.value; reportsView?: typeof reportsViewMode.value }) => {
  activeTab.value = tab
  if (tab === 'users' && !users.value.length) fetchUsers()
  if (tab === 'posts' && !posts.value.length) fetchPosts()
  if (tab === 'reports' && !reports.value.length) fetchReports()
  if (tab === 'support' && !supportTickets.value.length) fetchSupportTickets()
  if (tab === 'ads' && !ads.value.length) fetchAds()
  if (tab === 'verification' && !verRequests.value.length) fetchVerRequests()
  if (tab === 'frames' && !frameSubmissions.value.length) fetchFrameSubmissions()
  if (tab === 'automod') fetchAutoModLogs()
  if (tab === 'statistics') fetchStatistics()
  if (tab === 'updates' && !updates.value.length) fetchUpdates()
  if (tab === 'groups') fetchGroupsOverview()
  if (tab === 'finance') fetchPremiumOverview()
  if (tab === 'settings') fetchSettingsAndLogs()
  if (opts?.usersView) switchUsersView(opts.usersView)
  if (opts?.reportsView) switchReportsView(opts.reportsView)
}

const switchUsersView = (mode: typeof usersViewMode.value) => {
  usersViewMode.value = mode
  if (mode === 'team' && !staff.value.length) fetchStaff()
  if (mode === 'frozen' && !frozenUsers.value.length) fetchFrozenUsers()
  if (mode === 'archived' && !archivedUsers.value.length) fetchArchivedUsers()
}

const switchReportsView = (mode: typeof reportsViewMode.value) => {
  reportsViewMode.value = mode
  if (mode === 'appeals' && !appeals.value.length) fetchAppeals()
}

const switchAdsView = (mode: typeof adsViewMode.value) => {
  adsViewMode.value = mode
  if (mode === 'banners' && !banners.value.length) fetchBanners()
}

const switchCommsView = (mode: typeof commsViewMode.value) => {
  commsViewMode.value = mode
  if (mode === 'broadcasts' && !broadcasts.value.length) fetchBroadcasts()
}

const formatNum = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
const formatDate = (d: string) => new Date(d).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: '2-digit', month: '2-digit', year: '2-digit' })

const navItems = computed(() => [
  { tab: 'overview'     as const, label: langStore.t.adminNavOverview,        icon: 'LayoutDashboard', color: '#4C67CF', group: null,                      badge: null, minRole: 'moderator' },
  { tab: 'users'        as const, label: langStore.t.adminNavUsers,          icon: 'Users',           color: '#94a3b8', group: langStore.t.adminGroupModeration, badge: userTotal.value > 0 ? formatNum(userTotal.value) : null, minRole: 'moderator' },
  { tab: 'reports'      as const, label: langStore.t.adminNavReports,        icon: 'Flag',            color: '#f59e0b', group: langStore.t.adminGroupModeration, badge: reports.value.filter((r:any) => r.status==='pending').length || null, minRole: 'moderator' },
  { tab: 'support'      as const, label: langStore.t.adminNavSupport,        icon: 'LifeBuoy',        color: '#4C67CF', group: langStore.t.adminGroupModeration, badge: supportTickets.value.filter((t:any) => t.status==='open').length || null, minRole: 'moderator' },
  { tab: 'automod'      as const, label: 'AutoMod',                          icon: 'ShieldAlert',     color: '#ef4444', group: langStore.t.adminGroupModeration, badge: autoModTotal.value > 0 ? formatNum(autoModTotal.value) : null, minRole: 'moderator' },
  { tab: 'posts'        as const, label: langStore.t.posts,                 icon: 'FileText',        color: '#94a3b8', group: langStore.t.adminGroupContent,    badge: null, minRole: 'moderator' },
  { tab: 'verification' as const, label: langStore.t.secVerification,        icon: 'BadgeCheck',      color: '#2dd4bf', group: langStore.t.adminGroupContent,    badge: verRequests.value.filter((r:any) => r.status==='pending').length || null, minRole: 'moderator' },
  { tab: 'frames'       as const, label: langStore.t.adminFramesTabLabel,    icon: 'CircleDashed',    color: '#c084fc', group: langStore.t.adminGroupContent,    badge: frameSubmissions.value.filter((f:any) => f.status==='pending').length || null, minRole: 'admin' },
  { tab: 'ads'          as const, label: langStore.t.adLabel,                icon: 'Megaphone',       color: '#f97316', group: langStore.t.adminGroupContent,    badge: ads.value.filter((a:any) => a.status==='pending').length || null, minRole: 'admin' },
  { tab: 'updates'      as const, label: langStore.t.adminNavUpdates,        icon: 'Sparkles',        color: '#4C67CF', group: langStore.t.adminGroupContent,    badge: updates.value.filter((u:any) => u.is_active).length || null, minRole: 'admin' },
  { tab: 'groups'       as const, label: langStore.t.adminNavGroupsEvents,   icon: 'LayoutGrid',      color: '#4C67CF', group: langStore.t.adminGroupPlatform,   badge: null, minRole: 'moderator' },
  { tab: 'finance'      as const, label: langStore.t.adminNavFinancePremium, icon: 'Wallet',          color: '#a78bfa', group: langStore.t.adminGroupPlatform,   badge: null, minRole: 'admin' },
  { tab: 'settings'     as const, label: langStore.t.adminNavLogsSettings,   icon: 'Settings',        color: '#94a3b8', group: langStore.t.adminGroupPlatform,   badge: null, minRole: 'admin' },
  { tab: 'statistics'   as const, label: langStore.t.statsTab,               icon: 'BarChart2',       color: '#10b981', group: langStore.t.adminGroupAnalytics,  badge: null, minRole: 'admin' },
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
  { label: langStore.t.adminStatTotalUsers,   icon: 'Users',       color: '#4C67CF', value: formatNum(stats.value.users.total),          sub: `+${stats.value.users.today} ${langStore.t.adminSubToday}` },
  { label: langStore.t.adminStatNewToday,     icon: 'UserPlus',    color: '#10b981', value: formatNum(stats.value.users.today),          sub: `+${stats.value.users.week} ${langStore.t.adminSubThisWeek}` },
  { label: langStore.t.adminStatWithSub,      icon: 'Sparkles',    color: '#a78bfa', value: formatNum(stats.value.premiumSubscribers),   sub: `${langStore.t.adminSubOutOf} ${formatNum(stats.value.users.total)} ${langStore.t.adminSubUsersGenitive}` },
  { label: langStore.t.adminStatTotalPosts,   icon: 'FileText',    color: '#22d3ee', value: formatNum(stats.value.posts.total),          sub: `+${stats.value.posts.week} ${langStore.t.adminSubThisWeek}` },
  { label: langStore.t.adminStatPostsToday,   icon: 'FilePlus2',   color: '#f59e0b', value: formatNum(stats.value.posts.today),          sub: langStore.t.adminSubPublications },
  { label: langStore.t.adminStatReportsQueue, icon: 'Flag',        color: '#f43f5e', value: formatNum(stats.value.moderation.pendingReports), sub: langStore.t.adminSubAwaitingReview },
] : [])

// ── Growth charts — cumulative totals reconstructed from last-12-months deltas
const formatMonthShort = (d: string | Date) => new Date(d).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { month: 'short' })

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
  const label = new Date(d).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { weekday: 'short', day: 'numeric', month: 'short' })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// ── Weekly activity — posts / likes / comments per day, last 7 days
const weeklyActivityRows = computed(() => {
  const wa = stats.value?.weeklyActivity
  if (!wa) return []
  const rows = [
    { label: langStore.t.postsTab,   color: '#4C67CF', days: wa.posts },
    { label: langStore.t.adminLikesLabel, color: '#f7a9e2', days: wa.likes },
    { label: langStore.t.comments,   color: '#cd83f5', days: wa.comments },
  ]
  return rows.map(r => ({
    ...r,
    total: r.days.reduce((s: number, d: any) => s + d.count, 0),
    max: Math.max(...r.days.map((d: any) => d.count), 1),
  }))
})

// ── Geography — top countries by user count (from /admin/stats/network)
// "Не указана" is the unspecified bucket — excluded so the ranking only reflects known countries
const topCountries = computed(() => {
  const rows = (networkStats.value?.usersByCountry ?? []).filter((r: any) => r.label && r.label !== 'null' && r.label !== 'Не указана')
  const total = rows.reduce((s: number, r: any) => s + r.value, 0) || 1
  return rows.slice(0, 5).map((r: any) => ({ ...r, pct: Math.round((r.value / total) * 100) }))
})
const topKnownCountryLabel = computed(() => {
  const rows = networkStats.value?.usersByCountry ?? []
  return rows.find((r: any) => r.label && r.label !== 'Не указана')?.label ?? '—'
})

// ── Reports by AutoMod category
const REPORT_CATEGORY_LABEL = computed<Record<string, string>>(() => ({
  spam: langStore.t.adminCategorySpam, toxic: langStore.t.adminCategoryToxic, duplicate: langStore.t.adminCategoryDuplicate, fraud: langStore.t.adminCategoryFraud,
  suspicious: langStore.t.adminCategorySuspicious, manual: langStore.t.adminCategoryManual, other: langStore.t.other,
}))
const topReportCategories = computed(() => {
  const rows = stats.value?.reportsByCategory ?? []
  const max = Math.max(...rows.map((r: any) => r.count), 1)
  return rows.slice(0, 5).map((r: any) => ({ ...r, label: REPORT_CATEGORY_LABEL.value[r.category] ?? r.category, pct: Math.round((r.count / max) * 100) }))
})

// Moderation snapshot — the things staff act on first (freezes, bans, reports, automod)
const modSnapshot = computed(() => stats.value ? [
  { tab: 'reports'      as const, usersView: undefined as typeof usersViewMode.value | undefined, label: langStore.t.adminStatReportsQueue, icon: 'Flag',        color: '#f59e0b', value: stats.value.moderation.pendingReports },
  { tab: 'users'        as const, usersView: 'frozen' as typeof usersViewMode.value | undefined,  label: langStore.t.adminNavFrozen,        icon: 'Snowflake',   color: '#38bdf8', value: stats.value.moderation.frozenUsers },
  { tab: 'automod'      as const, usersView: undefined as typeof usersViewMode.value | undefined, label: `AutoMod ${langStore.t.adminLast24h}`, icon: 'ShieldAlert', color: '#ef4444', value: stats.value.moderation.autoModFlags24h },
  { tab: 'verification' as const, usersView: undefined as typeof usersViewMode.value | undefined, label: langStore.t.secVerification,       icon: 'BadgeCheck',  color: '#2dd4bf', value: stats.value.moderation.pendingVerification },
] : [])

const roleColor = (role: string) => ({ owner: '#eab308', admin: '#f97316', moderator: '#4C67CF', user: '#64748b' }[role] ?? '#64748b')

const tabTitle = computed<Record<string, string>>(() => ({
  overview: langStore.t.adminTabTitleOverview,
  settings: langStore.t.adminTabTitleSettings,
}))

const tabSubtitle = computed<Record<string, string>>(() => ({
  overview: langStore.t.adminTabSubOverview,
  users: langStore.t.adminTabSubUsers,
  posts: langStore.t.adminTabSubPosts,
  reports: langStore.t.adminTabSubReports,
  support: langStore.t.adminTabSubSupport,
  ads: langStore.t.adminTabSubAds,
  verification: langStore.t.adminTabSubVerification,
  automod: langStore.t.adminTabSubAutomod,
  statistics: langStore.t.adminTabSubStatistics,
  updates: langStore.t.adminTabSubUpdates,
  groups: langStore.t.adminTabSubGroups,
  finance: langStore.t.adminTabSubFinance,
  settings: langStore.t.adminTabSubSettings,
}))

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
          <BIcon name="ArrowLeft" class="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" /> {{ langStore.t.goHome }}
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
            :placeholder="langStore.t.adminSearchPlaceholderGlobal"
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
        <button :title="langStore.t.adminBellPendingReview" class="relative hidden md:flex w-9 h-9 rounded-xl bg-brand-bg border border-brand-border items-center justify-center text-white/50 hover:text-white transition-all flex-shrink-0">
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
              <h2 class="text-xs font-extrabold text-white/50 tracking-[0.15em] uppercase">{{ langStore.t.adminRequiresAttention }}</h2>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              <button v-for="mc in modSnapshot" :key="mc.label" @click="switchTab(mc.tab, { usersView: mc.usersView })"
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

            <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">{{ langStore.t.adminGeneralStats }}</h2>
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
                <h3 class="font-extrabold text-white text-sm">{{ langStore.t.adminUserGrowthTitle }}</h3>
                <p class="text-xs text-white/40 mt-0.5 mb-4">{{ langStore.t.adminUserGrowthSub }}</p>
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
                <h3 class="font-extrabold text-white text-sm">{{ langStore.t.adminPostGrowthTitle }}</h3>
                <p class="text-xs text-white/40 mt-0.5 mb-4">{{ langStore.t.adminPostGrowthSub }}</p>
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
                <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminWeeklyActivityTitle }}</h3>
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
                <p v-if="!weeklyActivityRows.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoDataLabel }}</p>
              </div>

              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminUserGeographyTitle }}</h3>
                <div v-for="c in topCountries" :key="c.label" class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-semibold text-white/60">{{ c.label }}</span>
                    <span class="text-xs font-bold text-white">{{ c.pct }}%</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full bg-brand-accent" :style="`width:${c.pct}%`" />
                  </div>
                </div>
                <p v-if="!topCountries.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoDataLabel }}</p>
              </div>

              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminReportsByCategoryTitle }}</h3>
                <div v-for="r in topReportCategories" :key="r.category" class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-semibold text-white/60">{{ r.label }}</span>
                    <span class="text-xs font-bold text-white">{{ r.count }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full bg-brand-warning" :style="`width:${r.pct}%`" />
                  </div>
                </div>
                <p v-if="!topReportCategories.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoReportsYet }}</p>
              </div>
            </div>

            <!-- Roles -->
            <div class="rounded-2xl border border-brand-border bg-brand-card p-6">
              <h3 class="font-extrabold text-sm text-white mb-4 flex items-center gap-2">
                <BIcon name="Users" class="w-4 h-4 text-white/40" /> {{ langStore.t.adminRoleDistribution }}
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
          <!-- Segmented toggle: user list / team & roles / frozen / banned (all merged from old separate tabs) -->
          <div class="flex items-center gap-2 mb-5 p-1 rounded-2xl bg-white/[0.04] w-fit flex-wrap">
            <button type="button" @click="switchUsersView('all')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="usersViewMode === 'all' ? 'bg-[#4C67CF]/20 text-[#4C67CF]' : 'text-white/40 hover:text-white/70'">
              <BIcon name="Users" class="w-3.5 h-3.5" /> {{ langStore.t.tabAll }}
            </button>
            <button type="button" @click="switchUsersView('team')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="usersViewMode === 'team' ? 'bg-amber-500/20 text-amber-400' : 'text-white/40 hover:text-white/70'">
              <BIcon name="ShieldCheck" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavTeamRoles }}
              <span v-if="staff.length" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                :class="usersViewMode === 'team' ? 'bg-amber-400/20 text-amber-300' : 'bg-white/10 text-white/40'">{{ staff.length }}</span>
            </button>
            <button type="button" @click="switchUsersView('frozen')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="usersViewMode === 'frozen' ? 'bg-sky-500/20 text-sky-400' : 'text-white/40 hover:text-white/70'">
              <BIcon name="Snowflake" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavFrozen }}
              <span v-if="frozenTotal" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                :class="usersViewMode === 'frozen' ? 'bg-sky-400/20 text-sky-300' : 'bg-white/10 text-white/40'">{{ frozenTotal }}</span>
            </button>
            <button type="button" @click="switchUsersView('archived')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="usersViewMode === 'archived' ? 'bg-rose-500/20 text-rose-400' : 'text-white/40 hover:text-white/70'">
              <BIcon name="Ban" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavBanned }}
              <span v-if="archivedTotal" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                :class="usersViewMode === 'archived' ? 'bg-rose-400/20 text-rose-300' : 'bg-white/10 text-white/40'">{{ archivedTotal }}</span>
            </button>
          </div>

          <template v-if="usersViewMode === 'all'">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <div class="rounded-2xl px-3.5 py-2.5" style="background:rgba(255,255,255,0.035)">
              <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide">{{ langStore.t.adminTotalLabel }}</p>
              <p class="text-lg font-black text-white">{{ formatNum(userTotal) }}</p>
            </div>
            <div class="rounded-2xl px-3.5 py-2.5" style="background:rgba(16,185,129,0.07)">
              <p class="text-[10px] font-bold text-emerald-400/70 uppercase tracking-wide">{{ langStore.t.adminStatNewToday }}</p>
              <p class="text-lg font-black text-emerald-400">{{ userQuickStats.newToday }}</p>
            </div>
            <div class="rounded-2xl px-3.5 py-2.5" style="background:rgba(167,139,250,0.07)">
              <p class="text-[10px] font-bold text-violet-300/70 uppercase tracking-wide">{{ langStore.t.adminStatWithSub }}</p>
              <p class="text-lg font-black text-violet-300">{{ userQuickStats.subscribers }}</p>
            </div>
            <div class="rounded-2xl px-3.5 py-2.5" style="background:rgba(56,189,248,0.07)">
              <p class="text-[10px] font-bold text-sky-400/70 uppercase tracking-wide">{{ langStore.t.adminFrozenCountLabel }}</p>
              <p class="text-lg font-black text-sky-400">{{ userQuickStats.frozen }}</p>
            </div>
          </div>

          <div class="flex items-center gap-3 mb-5">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="userSearch" @input="onUserSearch" type="text" :placeholder="langStore.t.adminSearchPlaceholderUsers"
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
                <router-link :to="`/profile/${user.username}`" target="_blank" class="flex items-center gap-3 min-w-0 group/user">
                  <div class="flex-shrink-0 relative">
                    <img v-if="user.avatar_url" :src="user.avatar_url"
                      class="w-9 h-9 rounded-full object-cover border border-white/[0.06] group-hover/user:opacity-80 transition-opacity" />
                    <div v-else class="w-9 h-9 rounded-full border border-white/[0.06] flex items-center justify-center text-sm font-bold group-hover/user:opacity-80 transition-opacity"
                      :style="`background:${roleColor(user.role)}20;color:${roleColor(user.role)}`">
                      {{ (user.display_name || user.username || '?')[0].toUpperCase() }}
                    </div>
                  </div>
                  <div class="min-w-0">
                    <p class="font-bold text-sm text-white truncate flex items-center gap-1.5 group-hover/user:text-[#4C67CF] transition-colors">
                      {{ user.display_name || user.username }}
                      <span v-if="tierLabel(user.subscription_tier)"
                        class="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border flex-shrink-0"
                        :style="`color:${tierColor(user.subscription_tier)};border-color:${tierColor(user.subscription_tier)}40;background:${tierColor(user.subscription_tier)}18`">
                        ✦ {{ tierLabel(user.subscription_tier) }}
                      </span>
                    </p>
                    <p class="text-xs text-white/35 truncate">@{{ user.username }}</p>
                  </div>
                </router-link>

                <!-- Email -->
                <p class="text-xs text-white/50 truncate">{{ user.email }}</p>

                <!-- Статус -->
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[10px] font-extrabold px-2 py-1 rounded-full flex-shrink-0"
                    :style="`background:${userStatus(user).color}20;color:${userStatus(user).color}`">
                    {{ userStatus(user).label }}
                  </span>
                  <span v-if="user.warn_count > 0" :title="`${user.warn_count}/5 ${langStore.t.adminWarnCountSuffix}`"
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
                  {{ user.badge_type ? langStore.t.adminYesLabel : langStore.t.adminNoLabel }}
                </p>

                <!-- Действия — inline on mobile, floating overlay on hover at lg+ so it never fights the columns for space -->
                <div class="flex items-center gap-1.5 flex-wrap lg:flex-nowrap flex-shrink-0 justify-start mt-1 lg:mt-0
                  static lg:absolute lg:right-4 lg:top-1/2 lg:-translate-y-1/2 lg:z-10
                  opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:pointer-events-none lg:group-hover:pointer-events-auto
                  transition-opacity lg:bg-[#0B1030]/95 lg:backdrop-blur-md lg:rounded-full lg:pl-3 lg:pr-2 lg:py-2 lg:shadow-xl lg:shadow-black/50 lg:border lg:border-white/10">
                  <button v-if="isAdminPlus" type="button" data-user-menu :title="langStore.t.adminGrantRevokeSubTooltip"
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
                  <button v-if="user.deceased_at" @click="unmarkDeceased(user.id)" :title="langStore.t.adminUndoDeceasedTooltip"
                    class="w-7 h-7 rounded-full bg-white/10 border border-white/15 text-white/60 hover:bg-white/20 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    ↺
                  </button>
                  <button v-else @click="markDeceased(user.id)" :title="langStore.t.adminMarkDeceasedTooltip"
                    class="w-7 h-7 rounded-full bg-white/5 border border-white/10 text-white/40 hover:bg-white/15 hover:text-white/60 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    🪦
                  </button>
                  <!-- freeze / unfreeze -->
                  <button v-if="user.frozen_at" @click="unfreezeUser(user.id)" :title="langStore.t.adminUnfreezeTooltip"
                    class="w-7 h-7 rounded-full bg-sky-500/10 border border-sky-500/15 text-sky-400 hover:bg-sky-500/20 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    🔓
                  </button>
                  <button v-else @click="freezeUser(user.id)" :title="langStore.t.adminFreezeTooltip"
                    class="w-7 h-7 rounded-full bg-sky-500/10 border border-sky-500/15 text-sky-400 hover:bg-sky-500/20 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    🧊
                  </button>
                  <!-- clear warns -->
                  <button v-if="user.warn_count > 0" @click="clearUserWarns(user.id)" :title="langStore.t.adminClearWarnsTooltip"
                    class="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/15 text-amber-400 hover:bg-amber-500/20 flex items-center justify-center transition-all text-xs flex-shrink-0">
                    ✖
                  </button>
                  <button @click="deleteUser(user.id)" :title="langStore.t.deleteBtn"
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
          </template>

          <!-- ── Team & roles (merged in from the old separate tab) ─────── -->
          <template v-else-if="usersViewMode === 'team'">
            <div class="flex items-center justify-between mb-5">
              <p class="text-sm text-white/40">{{ langStore.t.adminTabSubTeam }}</p>
              <button v-if="isOwnerRole" @click="showInviteForm = !showInviteForm"
                class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-white shadow-lg transition-all"
                style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 16px rgba(76,103,207,0.3)">
                <BIcon name="UserPlus" class="w-3.5 h-3.5" /> {{ langStore.t.adminInviteToTeamBtn }}
              </button>
            </div>

            <Transition name="filter-expand">
              <div v-if="showInviteForm" class="rounded-2xl border border-brand-border bg-brand-card p-5 mb-5">
                <h3 class="font-extrabold text-white text-sm mb-3">{{ langStore.t.adminNewStaffMemberTitle }}</h3>
                <div class="flex flex-col sm:flex-row gap-2">
                  <input v-model="inviteIdentifier" :placeholder="langStore.t.adminEmailOrUsernamePlaceholder" class="adm-input flex-1" />
                  <select v-model="inviteRole" class="adm-input sm:w-44">
                    <option value="moderator">{{ langStore.t.roleModerator }}</option>
                    <option value="admin">{{ langStore.t.roleAdmin }}</option>
                    <option value="owner">{{ langStore.t.roleOwner }}</option>
                  </select>
                  <button @click="inviteToStaff" :disabled="isInviting || !inviteIdentifier.trim()"
                    class="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all flex-shrink-0"
                    style="background:linear-gradient(135deg,#4C67CF,#31458F)">
                    {{ isInviting ? '...' : langStore.t.adminAddBtn }}
                  </button>
                </div>
                <p v-if="inviteError" class="text-xs text-rose-400 mt-2">{{ inviteError }}</p>
              </div>
            </Transition>

            <div class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden">
              <div class="hidden lg:grid gap-3 px-5 py-3 border-b border-brand-border grid-cols-[2fr_1fr_1fr_1.2fr_1fr]">
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColStaffMember }}</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColRole }}</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.statusFieldLabel }}</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColLastActivity }}</span>
                <span></span>
              </div>
              <div v-if="isLoadingStaff" class="p-5 space-y-3">
                <div v-for="n in 4" :key="n" class="h-10 rounded-xl bg-white/5 animate-pulse" />
              </div>
              <div v-else-if="!staff.length" class="flex flex-col items-center gap-3 py-16 text-white/25">
                <BIcon name="ShieldCheck" class="w-10 h-10 opacity-40" />
                <p class="text-sm font-semibold">{{ langStore.t.adminOnlyYouInTeam }}</p>
              </div>
              <div v-else class="divide-y divide-brand-border">
                <div v-for="m in staff" :key="m.id"
                  class="grid grid-cols-1 lg:grid-cols-[2fr_1fr_1fr_1.2fr_1fr] gap-2 lg:gap-3 items-center px-5 py-3.5">
                  <router-link :to="`/profile/${m.username}`" target="_blank" class="flex items-center gap-2.5 min-w-0 group/user">
                    <img v-if="m.avatar_url" :src="m.avatar_url" class="w-9 h-9 rounded-full object-cover border border-white/10 flex-shrink-0 group-hover/user:opacity-80 transition-opacity" />
                    <div v-else class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 group-hover/user:opacity-80 transition-opacity"
                      :style="`background:${roleColor(m.role)}20;color:${roleColor(m.role)}`">
                      {{ (m.display_name || m.username || '?')[0].toUpperCase() }}
                    </div>
                    <div class="min-w-0">
                      <p class="font-bold text-sm text-white truncate group-hover/user:text-[#4C67CF] transition-colors">{{ m.display_name || m.username }}</p>
                      <p class="text-xs text-white/35 truncate">{{ m.email }}</p>
                    </div>
                  </router-link>
                  <span class="text-xs font-extrabold px-2.5 py-1 rounded-full w-fit"
                    :style="`background:${roleColor(m.role)}20;color:${roleColor(m.role)}`">
                    {{ roleLabel(m.role) }}
                  </span>
                  <span class="text-xs font-extrabold px-2.5 py-1 rounded-full w-fit"
                    :class="m.frozen_at ? 'bg-rose-500/15 text-rose-400' : 'bg-emerald-500/15 text-emerald-400'">
                    {{ m.frozen_at ? langStore.t.adminSuspendedLabel : langStore.t.activeLabel }}
                  </span>
                  <span class="text-xs text-white/50">{{ relativeLastSeen(m.last_seen_at) }}</span>
                  <div class="flex items-center gap-1.5 justify-start lg:justify-end">
                    <button v-if="m.frozen_at" @click="reactivateStaff(m)" :title="langStore.t.adminReturnToDutyTooltip"
                      class="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 flex items-center justify-center transition-all">
                      <BIcon name="ShieldCheck" class="w-3.5 h-3.5" />
                    </button>
                    <button v-else @click="suspendStaff(m)" :title="langStore.t.adminSuspendTooltip"
                      class="w-8 h-8 rounded-full bg-white/5 text-white/40 hover:bg-white/10 hover:text-white flex items-center justify-center transition-all">
                      <BIcon name="Snowflake" class="w-3.5 h-3.5" />
                    </button>
                    <button v-if="isOwnerRole" @click="removeFromStaff(m)" :title="langStore.t.adminRemoveFromTeamTooltip"
                      class="w-8 h-8 rounded-full bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 flex items-center justify-center transition-all">
                      <BIcon name="UserMinus" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <!-- ── Frozen accounts (merged in from the old separate tab) ──── -->
          <template v-else-if="usersViewMode === 'frozen'">
          <div class="flex items-center gap-3 mb-5">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="frozenSearch" @input="onFrozenSearch" type="text" :placeholder="langStore.t.adminSearchPlaceholderFrozen"
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
              <p class="text-sm font-semibold">{{ langStore.t.adminNoFrozenAccounts }}</p>
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
                      🧊 {{ langStore.t.adminFrozenSincePrefix }} {{ formatDate(user.frozen_at) }}
                    </span>
                  </p>
                  <p class="text-xs text-white/35 truncate">@{{ user.username }} · {{ user._count?.posts ?? 0 }} {{ langStore.t.posts }}</p>
                  <p v-if="user.frozen_reason" class="text-[11px] text-sky-400/70 truncate mt-0.5">{{ user.frozen_reason }}</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button @click="unfreezeUser(user.id)" :title="langStore.t.adminUnfreezeTooltip"
                    class="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/15 text-sky-400 hover:bg-sky-500/20 flex items-center justify-center transition-all text-xs">
                    🔓
                  </button>
                  <button v-if="user.warn_count > 0" @click="clearUserWarns(user.id)" :title="langStore.t.adminClearWarnsTooltip"
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
          </template>

          <!-- ── Banned accounts (merged in from the old separate tab) ──── -->
          <template v-else-if="usersViewMode === 'archived'">
          <div class="flex items-center gap-3 mb-5">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="archivedSearch" @input="onArchivedSearch" type="text" :placeholder="langStore.t.adminSearchPlaceholderArchive"
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
              <p class="text-sm font-semibold">{{ langStore.t.adminArchiveEmpty }}</p>
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
                  <p class="text-xs text-white/30">@{{ user.username }} · {{ langStore.t.adminDeletedOnPrefix }} {{ formatDate(user.deleted_at) }}</p>
                  <p v-if="user.frozen_reason" class="text-[11px] text-rose-400/70 truncate mt-0.5">{{ user.frozen_reason }}</p>
                </div>
                <button @click="restoreUser(user.id)"
                  class="px-3 py-1.5 text-xs font-bold rounded-xl border opacity-0 group-hover:opacity-100 transition-all
                  bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20">
                  {{ langStore.t.adminRestoreUserBtn }}
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
          </template>
        </div>
        <!-- ── POSTS ──────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'posts'">
          <div class="flex items-center gap-3 mb-4 flex-wrap">
            <div class="relative flex-1 max-w-sm">
              <BIcon name="Search" class="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input v-model="postSearch" @input="onPostSearch" type="text" :placeholder="langStore.t.adminSearchPlaceholderPosts"
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
              { v: '', l: langStore.t.tabAll },
              { v: 'media', l: langStore.t.adminFilterWithMedia },
              { v: 'nsfw', l: 'NSFW' },
              { v: 'announcement', l: langStore.t.adminFilterAnnouncements },
            ] as const)" :key="f.v"
              @click="postFilter = f.v; postPage = 1; fetchPosts()"
              class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
              :class="postFilter === f.v
                ? 'bg-[#4C67CF]/15 border-[#4C67CF]/25 text-[#4C67CF]'
                : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
              {{ f.l }}
            </button>
          </div>

          <div v-if="isLoadingPosts" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <div v-for="n in 6" :key="n" class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden animate-pulse">
              <div class="aspect-[4/3] bg-white/[0.06]" />
              <div class="p-4 space-y-2">
                <div class="h-3 bg-white/[0.08] rounded-full w-2/3" />
                <div class="h-2.5 bg-white/5 rounded-full w-full" />
                <div class="h-2.5 bg-white/5 rounded-full w-1/2" />
              </div>
            </div>
          </div>
          <div v-else-if="!posts.length" class="flex flex-col items-center gap-3 py-20 text-white/25 rounded-2xl border border-brand-border bg-brand-card">
            <BIcon name="FileText" class="w-10 h-10 opacity-40" />
            <p class="text-sm font-semibold">{{ langStore.t.adminNoPostsFound }}</p>
          </div>

          <!-- Tile grid -->
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <div v-for="post in posts" :key="post.id"
              class="relative rounded-2xl border border-brand-border bg-brand-card overflow-hidden flex flex-col transition-all
                hover:border-[#4C67CF]/35 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/20 group">

              <!-- Media preview / text placeholder -->
              <button v-if="post.media_urls?.length" type="button"
                @click="openPostMediaLightbox(post.media_urls, 0)"
                class="relative aspect-[4/3] w-full overflow-hidden bg-black/20 flex-shrink-0">
                <img :src="post.media_urls[0]" class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                <div v-if="post.media_urls.length > 1"
                  class="absolute top-2.5 right-2.5 flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-white">
                  <BIcon name="Images" class="w-3 h-3" /> {{ post.media_urls.length }}
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <div v-else class="relative aspect-[4/3] w-full flex items-center justify-center flex-shrink-0 p-5 text-center overflow-hidden"
                style="background:linear-gradient(150deg,rgba(76,103,207,0.16),rgba(139,92,246,0.10) 55%,rgba(76,103,207,0.05))">
                <BIcon name="Quote" class="absolute top-3 left-3 w-8 h-8 text-white/[0.06] -scale-x-100" />
                <p class="relative text-sm text-white/65 font-semibold line-clamp-5 leading-relaxed">{{ post.content || post.title }}</p>
              </div>

              <!-- Badges -->
              <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap max-w-[calc(100%-1.25rem)]">
                <span v-if="post.category"
                  class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-brand-accent/85 text-white backdrop-blur-sm shadow-sm">
                  #{{ post.category }}
                </span>
                <span v-if="post.is_nsfw"
                  class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-500/90 text-white backdrop-blur-sm shadow-sm">NSFW</span>
                <span v-if="post.is_announcement"
                  class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-500/90 text-white backdrop-blur-sm shadow-sm">{{ langStore.t.adminPinnedLabel }}</span>
                <span v-if="post.is_paid"
                  class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-500/90 text-white backdrop-blur-sm shadow-sm">{{ langStore.t.adminPaidLabel }}</span>
              </div>

              <!-- Hover actions -->
              <div class="absolute top-2.5 right-2.5 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <router-link :to="`/post/${post.id}`" target="_blank" @click.stop
                  class="w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/80
                    flex items-center justify-center transition-all" :title="langStore.t.adminOpenOnSiteTooltip">
                  <BIcon name="ExternalLink" class="w-3.5 h-3.5" />
                </router-link>
                <button @click="togglePostPin(post)" :title="langStore.t.adminTogglePinTooltip"
                  class="w-8 h-8 rounded-full backdrop-blur-sm flex items-center justify-center transition-all"
                  :class="post.is_announcement ? 'bg-amber-500/80 text-white' : 'bg-black/60 text-white/70 hover:text-white hover:bg-black/80'">
                  <BIcon name="Pin" class="w-3.5 h-3.5" />
                </button>
                <button @click="deletePost(post.id)"
                  class="w-8 h-8 rounded-full bg-rose-500/80 text-white hover:bg-rose-500
                    flex items-center justify-center transition-all" :title="langStore.t.deleteBtn">
                  <BIcon name="Trash2" class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Body -->
              <div class="p-4 flex flex-col gap-3 flex-1">
                <router-link :to="post.groupPosts?.[0]?.group ? `/groups/${post.groupPosts[0].group.slug}` : `/profile/${post.author?.username}`" target="_blank" class="flex items-center gap-2 min-w-0 group/user">
                  <img v-if="post.groupPosts?.[0]?.group?.avatar_url" :src="post.groupPosts[0].group.avatar_url"
                    class="w-7 h-7 rounded-lg object-cover border border-white/10 flex-shrink-0 group-hover/user:opacity-80 transition-opacity" />
                  <div v-else-if="post.groupPosts?.[0]?.group" class="w-7 h-7 rounded-lg border border-white/10 bg-[#4C67CF]/15 flex items-center justify-center text-[#4C67CF] font-bold text-xs flex-shrink-0">
                    {{ post.groupPosts[0].group.name[0].toUpperCase() }}
                  </div>
                  <img v-else-if="post.author?.avatar_url" :src="post.author.avatar_url"
                    class="w-7 h-7 rounded-full object-cover border border-white/10 flex-shrink-0 group-hover/user:opacity-80 transition-opacity" />
                  <div v-else class="w-7 h-7 rounded-full border border-white/10 bg-[#4C67CF]/15 flex items-center justify-center text-[#4C67CF] font-bold text-xs flex-shrink-0">
                    {{ (post.author?.display_name || post.author?.username || '?')[0].toUpperCase() }}
                  </div>
                  <span class="text-sm font-bold text-white truncate group-hover/user:text-[#4C67CF] transition-colors">{{ post.groupPosts?.[0]?.group?.name || post.author?.display_name || post.author?.username }}</span>
                  <span class="text-[11px] text-white/30 flex-shrink-0 ml-auto">{{ formatDate(post.created_at) }}</span>
                </router-link>

                <div v-if="post.media_urls?.length && (post.title || post.content)" class="min-w-0">
                  <p v-if="post.title" class="text-sm font-bold text-white/90 truncate">{{ post.title }}</p>
                  <p class="text-xs text-white/50 line-clamp-2 mt-0.5">{{ post.content }}</p>
                </div>
                <p v-else-if="post.title" class="text-sm font-bold text-white/90 truncate -mt-0.5">{{ post.title }}</p>

                <!-- Stats footer -->
                <div class="flex items-center gap-3 mt-auto pt-2.5 border-t border-white/[0.06]">
                  <span class="flex items-center gap-1 text-xs font-bold text-emerald-400/80" :title="langStore.t.adminLikesLabel">
                    <BIcon name="ThumbsUp" class="w-3.5 h-3.5" /> {{ formatNum(post.likes_count ?? 0) }}
                  </span>
                  <span class="flex items-center gap-1 text-xs font-bold text-rose-400/80" :title="langStore.t.adminDislikesLabel">
                    <BIcon name="ThumbsDown" class="w-3.5 h-3.5" /> {{ formatNum(post.dislikes_count ?? 0) }}
                  </span>
                  <span class="w-px h-3 bg-white/[0.08]" />
                  <span class="flex items-center gap-1 text-xs font-semibold text-white/50">
                    <BIcon name="MessageCircle" class="w-3.5 h-3.5 text-sky-400/70" /> {{ formatNum(post._count?.comments ?? 0) }}
                  </span>
                  <span class="flex items-center gap-1 text-xs font-semibold text-white/50 ml-auto">
                    <BIcon name="Repeat2" class="w-3.5 h-3.5 text-violet-400/70" /> {{ formatNum(post._count?.repaws ?? 0) }}
                  </span>
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
          <!-- Segmented toggle: user reports vs ban/freeze appeals (merged from the old separate tab) -->
          <div class="flex items-center gap-2 mb-5 p-1 rounded-2xl bg-white/[0.04] w-fit">
            <button type="button" @click="switchReportsView('reports')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="reportsViewMode === 'reports' ? 'bg-amber-500/20 text-amber-400' : 'text-white/40 hover:text-white/70'">
              <BIcon name="Flag" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavReports }}
            </button>
            <button type="button" @click="switchReportsView('appeals')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="reportsViewMode === 'appeals' ? 'bg-violet-500/20 text-violet-400' : 'text-white/40 hover:text-white/70'">
              <BIcon name="Gavel" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavAppeals }}
              <span v-if="appeals.length" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                :class="reportsViewMode === 'appeals' ? 'bg-violet-400/20 text-violet-300' : 'bg-white/10 text-white/40'">{{ appeals.length }}</span>
            </button>
          </div>

          <template v-if="reportsViewMode === 'reports'">
          <!-- Filter pills -->
          <div class="flex gap-2 mb-5 flex-wrap">
            <button v-for="s in (['', 'pending', 'resolved', 'dismissed'] as const)" :key="s"
              @click="reportFilter = s; fetchReports()"
              class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
              :class="reportFilter === s
                ? 'bg-brand-accent/20 border-brand-accent/30 text-brand-accent'
                : 'bg-brand-card border-brand-border text-white/40 hover:text-white/70'">
              {{ { '': langStore.t.tabAll, pending: langStore.t.reportStatusPending, resolved: langStore.t.reportStatusResolved, dismissed: langStore.t.reportStatusDismissed }[s] }}
            </button>
          </div>

          <div v-if="isLoadingReports" class="space-y-3">
            <div v-for="n in 4" :key="n" class="h-24 rounded-2xl border border-brand-border bg-brand-card animate-pulse" />
          </div>
          <div v-else-if="reports.length === 0"
            class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
            <BIcon name="Flag" class="w-10 h-10 opacity-40" />
            <p class="text-sm font-semibold">{{ langStore.t.adminNoReports }}</p>
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
                      {{ { pending: langStore.t.reportStatusPending, resolved: langStore.t.reportStatusResolved, dismissed: langStore.t.reportStatusDismissed }[folder.status] }}
                    </span>
                    <span v-if="folder.count > 1"
                      class="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400"
                      :title="`${folder.count} ${langStore.t.adminSameTargetReportsTooltip}`">
                      ×{{ folder.count }}
                    </span>
                  </div>

                  <!-- Title = complaint reason -->
                  <p class="font-bold text-white">{{ folder.reports[0].reason }}</p>

                  <!-- Evidence attached by the reporter -->
                  <div v-if="folder.reports[0].evidence_urls?.length" class="flex gap-2 mt-2 flex-wrap">
                    <a v-for="(url, ei) in folder.reports[0].evidence_urls" :key="ei" :href="safeHref(url)" target="_blank" rel="noopener noreferrer"
                      class="w-14 h-14 rounded-lg overflow-hidden border border-white/[0.08] flex-shrink-0">
                      <img :src="url" class="w-full h-full object-cover" />
                    </a>
                  </div>

                  <!-- Subtitle: reporter + target -->
                  <p class="text-xs text-white/40 mt-1">
                    {{ langStore.t.adminReportFromPrefix }} <span class="font-semibold text-white/60">{{ folder.reports[0].reporter?.display_name || folder.reports[0].reporter?.username }}</span>
                    {{ langStore.t.adminReportOnPrefix }} {{ (REPORT_TARGET_LABEL[folder.target_type] ?? folder.target_type).toLowerCase() }}
                    <router-link v-if="folder.target_type === 'post' && folder.post" :to="`/post/${folder.target_id}`" target="_blank" class="font-semibold text-brand-accent hover:underline">@{{ folder.post.author?.username }}</router-link>
                    <router-link v-else-if="folder.target_type === 'user' && folder.reportedUser" :to="`/profile/${folder.reportedUser.username}`" target="_blank" class="font-semibold text-brand-accent hover:underline">@{{ folder.reportedUser.username }}</router-link>
                    <router-link v-else-if="folder.target_type === 'group' && folder.reportedGroup" :to="`/groups/${folder.reportedGroup.slug}`" target="_blank" class="font-semibold text-brand-accent hover:underline">{{ folder.reportedGroup.name }}</router-link>
                    <span v-else class="font-semibold text-white/50">{{ folder.target_id.slice(0, 8) }}…</span>
                    · {{ formatDate(folder.created_at) }}
                  </p>

                  <button v-if="folder.count > 1" @click="toggleReportGroup(folder)"
                    class="text-[11px] font-bold text-brand-accent/80 hover:text-brand-accent mt-1.5 transition-colors">
                    {{ expandedReportGroups.has(reportGroupKey(folder)) ? langStore.t.adminHideLabel : langStore.t.adminShowAllReports }} ({{ folder.count }})
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
                    <BIcon name="TriangleAlert" class="w-3.5 h-3.5" /> {{ langStore.t.adminResolveProblemBtn }}
                  </button>
                  <button @click="resolveReportGroup(folder, 'dismissed')" :disabled="folder.status !== 'pending'"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-white/40 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <BIcon name="X" class="w-3.5 h-3.5" /> {{ langStore.t.adminRejectBtn }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ResolveReportModal v-if="resolvingFolder" :folder="resolvingFolder"
            @close="resolvingFolder = null" @resolved="onFolderResolved" />
          </template>

          <template v-else>
          <div v-if="isLoadingAppeals" class="space-y-3">
            <div v-for="n in 3" :key="n" class="h-28 rounded-2xl border border-brand-border bg-brand-card animate-pulse" />
          </div>
          <div v-else-if="appeals.length === 0"
            class="rounded-2xl border border-brand-border bg-brand-card flex flex-col items-center gap-3 py-16 text-white/25">
            <BIcon name="Gavel" class="w-10 h-10 opacity-40" />
            <p class="text-sm font-semibold">{{ langStore.t.adminNoAppealsPending }}</p>
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
                  <p class="text-xs text-white/40 mt-1"><span class="font-bold text-amber-400">{{ langStore.t.adminWarnReasonLabel }}</span> {{ a.reason }}</p>
                  <img v-if="a.image_url" :src="a.image_url" class="mt-2 max-h-32 rounded-xl border border-white/10 object-cover" />
                  <p class="text-xs text-white/60 mt-2 bg-white/[0.03] border border-white/[0.08] rounded-xl p-2.5"><span class="font-bold text-violet-400">{{ langStore.t.adminAppealLabel }}</span> {{ a.appeal_text }}</p>
                  <p class="text-[11px] text-white/25 mt-1.5">{{ formatDate(a.appeal_created_at) }}</p>
                </div>
                <div class="flex flex-col gap-2 flex-shrink-0">
                  <button @click="decideAppeal(a.id, 'accepted')" :disabled="decidingAppealId === a.id"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-30 transition-all">
                    <BIcon name="Check" class="w-3.5 h-3.5" /> {{ langStore.t.adminAcceptBtn }}
                  </button>
                  <button @click="decideAppeal(a.id, 'rejected')" :disabled="decidingAppealId === a.id"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 text-white/40 hover:text-white disabled:opacity-30 transition-all">
                    <BIcon name="X" class="w-3.5 h-3.5" /> {{ langStore.t.adminRejectBtn }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          </template>
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
              {{ s === '' ? langStore.t.tabAll : SUPPORT_STATUS_LABEL[s] }}
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
              <p class="text-sm font-semibold">{{ langStore.t.adminNoTicketsFound }}</p>
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
                      <span v-if="ticket.source === 'email'" class="text-[10px] text-[#8fa0ec] font-bold">· {{ langStore.t.adminTicketSourceEmail }}</span>
                    </div>
                    <p class="text-sm text-white/80 font-bold">{{ ticket.subject }}</p>
                    <p class="text-xs text-white/30 mt-1.5">
                      <template v-if="ticket.user?.username">{{ langStore.t.adminFromPrefix }} @{{ ticket.user.username }}</template>
                      <template v-else-if="ticket.external_email">{{ langStore.t.adminFromPrefix }} {{ ticket.external_email }}</template>
                      <span v-if="ticket.contact_email && ticket.contact_email !== ticket.external_email"> · {{ ticket.contact_email }}</span>
                    </p>

                    <div class="mt-3 space-y-2">
                      <div v-for="m in ticket.messages" :key="m.id"
                        class="px-3 py-2 rounded-xl border"
                        :class="m.sender_type === 'admin' ? 'bg-[#4C67CF]/[0.08] border-[#4C67CF]/20' : 'bg-white/5 border-white/[0.06]'">
                        <p class="text-[10px] font-bold mb-0.5" :class="m.sender_type === 'admin' ? 'text-[#8fa0ec]' : 'text-white/30'">
                          {{ supportSenderLabel(m) }}
                        </p>
                        <p class="text-xs text-white/70 whitespace-pre-wrap">{{ m.body }}</p>
                        <div v-if="m.attachment_urls?.length" class="flex gap-2 mt-2 flex-wrap">
                          <a v-for="(url, ai) in m.attachment_urls" :key="ai" :href="safeHref(url)" target="_blank" rel="noopener noreferrer"
                            class="w-16 h-16 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
                            <img :src="url" class="w-full h-full object-cover" />
                          </a>
                        </div>
                      </div>
                    </div>

                    <div class="mt-3 flex flex-col sm:flex-row gap-2">
                      <input v-model="supportReplyDrafts[ticket.id]" type="text" :placeholder="langStore.t.adminReplyToUserPlaceholder"
                        class="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/[0.08] text-xs text-white placeholder-white/25 focus:outline-none focus:border-[#4C67CF]/40" />
                      <div class="flex gap-2 flex-shrink-0">
                        <button @click="replySupportTicket(ticket.id, 'in_progress')"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500/20 transition-all">
                          {{ langStore.t.adminMarkInProgressBtn }}
                        </button>
                        <button @click="replySupportTicket(ticket.id, 'resolved')"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                          ✓ {{ langStore.t.adminMarkResolvedBtn }}
                        </button>
                        <button @click="replySupportTicket(ticket.id, 'closed')"
                          class="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/5 border border-white/[0.08] text-white/40 hover:text-white transition-all">
                          {{ langStore.t.adminCloseBtn }}
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
          <!-- Segmented toggle: ad slots vs promo banners (merged from the old separate tab) -->
          <div class="flex items-center gap-2 mb-5 p-1 rounded-2xl bg-white/[0.04] w-fit">
            <button type="button" @click="switchAdsView('ads')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="adsViewMode === 'ads' ? 'bg-orange-500/20 text-orange-400' : 'text-white/40 hover:text-white/70'">
              <BIcon name="Megaphone" class="w-3.5 h-3.5" /> {{ langStore.t.adLabel }}
            </button>
            <button type="button" @click="switchAdsView('banners')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="adsViewMode === 'banners' ? 'bg-violet-500/20 text-violet-400' : 'text-white/40 hover:text-white/70'">
              <BIcon name="Image" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavBanners }}
              <span v-if="banners.length" class="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                :class="adsViewMode === 'banners' ? 'bg-violet-400/20 text-violet-300' : 'bg-white/10 text-white/40'">{{ banners.length }}/7</span>
            </button>
          </div>

          <template v-if="adsViewMode === 'ads'">
          <div class="flex items-center justify-between mb-5">
            <p class="text-xs text-white/35 font-semibold">{{ ads.length }} {{ langStore.t.adminAdsCountSuffix }}</p>
            <button @click="showAdForm = !showAdForm"
              class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shadow-lg text-white"
              style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 16px rgba(76,103,207,0.3)">
              <BIcon name="Plus" class="w-3.5 h-3.5" /> {{ langStore.t.adminCreateBtn }}
            </button>
          </div>

          <!-- Где показывается: мини-визуал мест размещения -->
          <div class="rounded-3xl border border-brand-border p-5 mb-5" style="background:#1F223C">
            <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">{{ langStore.t.adminAdShowsWhereTitle }}</p>
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
                <p class="text-[11px] font-bold text-white/70">{{ langStore.t.adminAdSlotFeedTop }}</p>
                <p class="text-[10px] text-white/30">{{ langStore.t.adminAdSlotFeedTopDesc }}</p>
                <p class="text-[10px] font-bold text-[#4C67CF] mt-1">{{ langStore.t.adminAdSlotFeedTopPrice }}</p>
              </div>
              <!-- Левый сайдбар -->
              <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
                <div class="w-full h-14 rounded-xl bg-white/5 flex flex-col overflow-hidden mb-2 p-1.5 gap-1">
                  <div class="h-2 w-10 rounded bg-white/10" />
                  <div class="h-2 w-8 rounded bg-white/10" />
                  <div class="h-2 w-9 rounded bg-[#4C67CF]/40" />
                </div>
                <p class="text-[11px] font-bold text-white/70">{{ langStore.t.adminAdSlotSidebarLeft }}</p>
                <p class="text-[10px] text-white/30">{{ langStore.t.adminAdSlotSidebarLeftDesc }}</p>
                <p class="text-[10px] font-bold text-[#4C67CF] mt-1">{{ langStore.t.adminAdSlotSidebarLeftPrice }}</p>
              </div>
              <!-- Правый сайдбар -->
              <div class="rounded-2xl border border-white/[0.08] p-3" style="background:#1F223C">
                <div class="w-full h-14 rounded-xl bg-white/5 flex flex-col overflow-hidden mb-2 p-1.5 gap-1">
                  <div class="h-2 w-9 rounded bg-[#4C67CF]/40" />
                  <div class="h-2 w-full rounded bg-white/10" />
                  <div class="h-2 w-7 rounded bg-white/10" />
                </div>
                <p class="text-[11px] font-bold text-white/70">{{ langStore.t.adminAdSlotSidebarRight }}</p>
                <p class="text-[10px] text-white/30">{{ langStore.t.adminAdSlotSidebarRightDesc }}</p>
                <p class="text-[10px] font-bold text-[#4C67CF] mt-1">{{ langStore.t.adminAdSlotSidebarRightPrice }}</p>
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
                <p class="text-[11px] font-bold text-white/70">{{ langStore.t.adminAdSlotGroupsPage }}</p>
                <p class="text-[10px] text-white/30">{{ langStore.t.adminAdSlotGroupsPageDesc }}</p>
                <p class="text-[10px] font-bold text-[#4C67CF] mt-1">{{ langStore.t.adminAdSlotGroupsPagePrice }}</p>
              </div>
            </div>
            <p class="text-[11px] text-white/25 mt-3">{{ langStore.t.adminAdSlotsDisclaimer }}</p>
          </div>

          <!-- Create form -->
          <Transition name="filter-expand">
            <div v-if="showAdForm"
              class="rounded-3xl border border-[#4C67CF]/20 p-6 mb-5 shadow-xl"
              style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.04))">
              <h4 class="font-extrabold text-sm text-white mb-4">{{ langStore.t.adminNewAdTitle }}</h4>
              <div class="space-y-3">
                <input v-model="newAd.title" :placeholder="langStore.t.adminTitlePlaceholderRequired"
                  class="adm-input" />
                <textarea v-model="newAd.description" :placeholder="langStore.t.adminDescriptionPlaceholder"
                  class="adm-input resize-none h-20" />
                <input v-model="newAd.linkUrl" type="url" :placeholder="langStore.t.adminLinkPlaceholderRequired"
                  class="adm-input" />
                <input v-model="newAd.priceLabel" :placeholder="langStore.t.adminPriceLabelPlaceholderExample"
                  class="adm-input" />
                <div>
                  <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">{{ langStore.t.adminImageOptionalLabel }}</p>
                  <div v-if="newAd.imageUrl" class="flex items-center gap-3 p-3 bg-white/5 border border-white/[0.08] rounded-2xl">
                    <img :src="newAd.imageUrl" class="w-16 h-12 object-cover rounded-xl flex-shrink-0" />
                    <span class="flex-1 text-xs text-white/45 truncate">{{ langStore.t.adminUploadedLabel }}</span>
                    <button @click="newAd.imageUrl = ''" class="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-rose-500/20 flex items-center justify-center transition-all">
                      <BIcon name="X" class="w-3.5 h-3.5 text-white/60" />
                    </button>
                  </div>
                  <MediaUpload v-else type="banners" @uploaded="(urls) => newAd.imageUrl = urls[0] ?? ''" />
                </div>
              </div>

              <!-- Live preview: exactly how the card renders on-site -->
              <div v-if="newAd.title" class="mt-4">
                <p class="text-[10px] font-bold text-white/30 uppercase tracking-wider mb-1.5">{{ langStore.t.adminCardPreviewLabel }}</p>
                <div class="max-w-xs bg-brand-card border border-brand-accent/25 rounded-3xl overflow-hidden shadow-xl">
                  <img v-if="newAd.imageUrl" :src="newAd.imageUrl" class="w-full object-cover max-h-28" />
                  <div class="px-4 py-3">
                    <span class="text-[9px] font-bold uppercase tracking-wider text-brand-accent bg-brand-accent/10 px-2 py-0.5 rounded-full border border-brand-accent/20">{{ langStore.t.adLabel }}</span>
                    <p class="text-xs font-bold text-white leading-snug mt-1.5">{{ newAd.title }}</p>
                    <p v-if="newAd.description" class="text-[11px] text-white/55 mt-0.5 line-clamp-2">{{ newAd.description }}</p>
                    <p v-if="newAd.priceLabel" class="text-[11px] font-bold text-[#4C67CF] mt-1">{{ newAd.priceLabel }}</p>
                  </div>
                </div>
              </div>

              <div class="flex gap-2 justify-end mt-4">
                <button @click="showAdForm = false"
                  class="px-4 py-2 rounded-xl text-sm text-white/40 hover:text-white hover:bg-white/5 border border-white/[0.08] transition-all">{{ langStore.t.cancel }}</button>
                <button @click="submitAd" :disabled="isSubmittingAd || !newAd.title || !newAd.linkUrl"
                  class="px-5 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all shadow-lg"
                  style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 12px rgba(76,103,207,0.3)">
                  {{ isSubmittingAd ? '...' : langStore.t.adminCreateBtn }}
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
            <p class="text-sm font-semibold">{{ langStore.t.adminNoAdsFound }}</p>
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
                  <span class="text-[10px] text-white/30">{{ ad.impressions ?? 0 }} {{ langStore.t.adminImpressionsSuffix }} · {{ ad.clicks ?? 0 }} {{ langStore.t.adminClicksSuffix }}</span>
                  <span v-if="ad.price_label" class="text-[10px] font-bold text-[#4C67CF] bg-[#4C67CF]/10 px-2 py-0.5 rounded-full border border-[#4C67CF]/20">{{ ad.price_label }}</span>
                </div>
                <p class="font-bold text-sm text-white">{{ ad.title }}</p>
                <p v-if="ad.description" class="text-xs text-white/40 mt-0.5 line-clamp-1">{{ ad.description }}</p>
                <a :href="safeHref(ad.link_url)" target="_blank"class="text-xs text-[#4C67CF] hover:text-[#4C67CF]/80 mt-0.5 block truncate transition-colors">{{ ad.link_url }}</a>
                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                  <router-link v-if="ad.requester" :to="`/profile/${ad.requester.username}`" target="_blank"
                    class="text-[11px] text-white/35 hover:text-white/60 transition-colors">
                    {{ langStore.t.adminFromPrefix }} @{{ ad.requester.username }}
                  </router-link>
                  <span v-if="ad.contact_info" class="text-[11px] text-white/25">· {{ langStore.t.adminContactLabel }} {{ ad.contact_info }}</span>
                </div>
              </div>
              <div class="flex flex-col gap-2 flex-shrink-0">
                <template v-if="ad.status === 'pending'">
                  <button @click="reviewAd(ad.id, 'active')"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all">
                    {{ langStore.t.adminApproveBtn }}
                  </button>
                  <button @click="reviewAd(ad.id, 'rejected')"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-all">
                    {{ langStore.t.adminRejectBtn }}
                  </button>
                </template>
                <button @click="deleteAd(ad.id)" :title="langStore.t.deleteBtn"
                  class="w-7 h-7 rounded-xl bg-white/5 border border-white/[0.08] text-white/40 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/20 flex items-center justify-center transition-all self-end">
                  <BIcon name="Trash2" class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
          </template>

          <template v-else>
          <div class="flex items-center justify-between mb-5">
            <div>
              <p class="text-xs text-white/35 font-semibold">{{ banners.length }}/7 {{ langStore.t.adminBannersCountSuffix }}</p>
            </div>
            <button @click="openBannerCreate" :disabled="banners.length >= 7"
              class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-lg"
              style="background:linear-gradient(135deg,#4C67CF,#31458F);box-shadow:0 4px 16px rgba(76,103,207,0.3)">
              <BIcon name="Plus" class="w-3.5 h-3.5" /> {{ langStore.t.adminNewBannerBtn }}
            </button>
          </div>

          <!-- Form -->
          <div v-if="showBannerForm"
            class="rounded-3xl border border-[#a78bfa]/20 p-6 mb-5 shadow-xl"
            style="background:linear-gradient(135deg,rgba(139,92,246,0.08),rgba(99,102,241,0.04))">
            <h3 class="font-extrabold text-sm text-white mb-5">
              {{ editingBannerId ? langStore.t.adminEditBannerTitle : langStore.t.adminCreateBannerTitle }}
            </h3>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminTitlePlaceholderRequired }}</label>
                <input v-model="bannerForm.title" :placeholder="langStore.t.adminBannerTitlePlaceholderExample" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminSubtitleLabel }}</label>
                <input v-model="bannerForm.subtitle" :placeholder="langStore.t.adminShortDescPlaceholder" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminTagPillLabel }}</label>
                <input v-model="bannerForm.tag_label" :placeholder="langStore.t.adminTagPlaceholderExample" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminPriceOrCaptionLabel }}</label>
                <input v-model="bannerForm.price_label" :placeholder="langStore.t.adminPricePlaceholderExample" class="adm-input" />
              </div>
              <div class="sm:col-span-2">
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminBannerImageLabel }}</label>
                <div v-if="bannerForm.image_url" class="flex items-center gap-3 p-3 bg-white/5 border border-white/[0.08] rounded-2xl">
                  <img :src="bannerForm.image_url" class="w-20 h-12 object-cover rounded-xl flex-shrink-0 border border-white/10" />
                  <div class="flex-1 min-w-0">
                    <p class="text-xs text-white/60">{{ langStore.t.adminImageUploadedLabel }}</p>
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
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.copyLinkBtn }}</label>
                <input v-model="bannerForm.link_url" placeholder="/stickers?tag=spring" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminGradientCssLabel }}</label>
                <input v-model="bannerForm.gradient" placeholder="linear-gradient(135deg,#FF6B9D,#C62A88)" class="adm-input" />
              </div>
              <div>
                <label class="block text-[11px] font-bold text-white/40 uppercase tracking-wider mb-1.5">{{ langStore.t.adminSortOrderLabel }}</label>
                <input v-model.number="bannerForm.sort_order" type="number" min="0" class="adm-input" />
              </div>
              <div class="flex items-end pb-0.5">
                <button type="button" @click="bannerForm.is_active = !bannerForm.is_active"
                  class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold border transition-all"
                  :class="bannerForm.is_active
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-white/5 text-white/40 border-white/[0.08]'">
                  <BIcon :name="bannerForm.is_active ? 'Eye' : 'EyeOff'" class="w-4 h-4" />
                  {{ bannerForm.is_active ? langStore.t.activeLabel : langStore.t.adminHiddenLabel }}
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
                <p class="text-white font-extrabold text-base leading-tight drop-shadow">{{ bannerForm.title || langStore.t.adminTitleFallbackLabel }}</p>
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
                {{ langStore.t.adminSaveBtn }}
              </button>
              <button @click="showBannerForm = false"
                class="px-5 py-2.5 rounded-2xl text-sm font-bold bg-white/5 border border-white/[0.08] text-white/50 hover:text-white transition-all">
                {{ langStore.t.cancel }}
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
            <p class="text-sm font-semibold">{{ langStore.t.adminNoBanners }}</p>
            <p class="text-xs text-center max-w-xs">{{ langStore.t.adminNoBannersHint }}</p>
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
                      {{ b.is_active ? `● ${langStore.t.activeLabel}` : `○ ${langStore.t.adminHiddenLabel}` }}
                    </span>
                  </div>
                  <p v-if="b.subtitle" class="text-xs text-white/35 truncate">{{ b.subtitle }}</p>
                  <p class="text-[10px] text-white/20 mt-0.5">{{ langStore.t.adminSortOrderLabel }} {{ b.sort_order }}{{ b.price_label ? ` · ${b.price_label}` : '' }}</p>
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
            <p class="text-xs font-semibold text-amber-400">{{ langStore.t.adminBannerLimitReachedFull }}</p>
          </div>
          </template>
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
              {{ { '': langStore.t.tabAll, pending: langStore.t.adminVerFilterPending, approved: langStore.t.adminVerFilterApproved, rejected: langStore.t.adminVerFilterRejected }[s] }}
            </button>
          </div>

          <div class="space-y-3">
            <div v-if="isLoadingVer">
              <div v-for="n in 3" :key="n" class="h-28 rounded-3xl bg-white/5 animate-pulse" />
            </div>
            <div v-else-if="verRequests.length === 0"
              class="flex flex-col items-center gap-3 py-20 text-white/25">
              <BIcon name="BadgeCheck" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">{{ langStore.t.adminNoRequestsFound }}</p>
            </div>
            <div v-else class="space-y-3">
              <div v-for="req in verRequests" :key="req.id"
                class="w-full max-w-full rounded-2xl border overflow-hidden transition-colors"
                :class="req.status==='pending'
                  ? 'border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-500/50'
                  : req.status==='approved'
                    ? 'border-emerald-500/30 bg-emerald-500/[0.05] hover:border-emerald-500/50'
                    : 'border-rose-500/30 bg-rose-500/[0.05] hover:border-rose-500/50'">

                <!-- Header -->
                <div class="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5 min-w-0">
                  <router-link :to="`/profile/${req.user?.username}`" target="_blank"
                    class="flex items-center gap-2.5 group/user min-w-0">
                    <img v-if="req.user?.avatar_url" :src="req.user.avatar_url"
                      class="w-9 h-9 rounded-xl object-cover border border-white/10 flex-shrink-0" />
                    <div v-else class="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs flex-shrink-0">
                      {{ (req.user?.display_name || req.user?.username || '?')[0].toUpperCase() }}
                    </div>
                    <div class="min-w-0">
                      <p class="font-bold text-[13px] text-white group-hover/user:text-blue-400 transition-colors flex items-center gap-1 truncate">
                        <span class="truncate">{{ req.user?.display_name || req.user?.username }}</span>
                        <BIcon name="ExternalLink" class="w-3 h-3 opacity-0 group-hover/user:opacity-60 transition-opacity flex-shrink-0" />
                      </p>
                      <p class="text-[11px] text-white/35 truncate">@{{ req.user?.username }}</p>
                    </div>
                  </router-link>

                    <div class="flex items-center gap-2 flex-shrink-0">
                      <span class="text-xs font-extrabold px-2.5 py-1 rounded-full border"
                        :class="req.status==='pending'
                          ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                          : req.status==='approved'
                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                            : 'text-rose-400 bg-rose-500/10 border-rose-500/20'">
                        {{ {pending: langStore.t.adminVerStatusPending, approved: langStore.t.adminVerStatusApproved, rejected: langStore.t.adminVerStatusRejected}[req.status] }}
                      </span>
                      <span class="text-[10px] text-white/25 whitespace-nowrap">{{ formatDate(req.created_at) }}</span>
                    </div>
                  </div>

                  <div v-if="req.verification_type" class="mt-2.5">
                    <span class="text-xs font-bold pl-1.5 pr-2.5 py-1 rounded-full border inline-flex items-center gap-1.5"
                      :class="verTypeColors[req.verification_type] || 'text-blue-400 bg-blue-400/10 border-blue-400/20'">
                      <BIcon :name="verTypeIcons[req.verification_type] || 'BadgeCheck'" class="w-3.5 h-3.5" />
                      {{ verTypeLabels[req.verification_type] || req.verification_type }}
                    </span>
                  </div>

                <!-- Criteria: single wrapping row, never overflows -->
                <div class="px-4 flex flex-wrap items-center gap-1 min-w-0">
                  <span v-for="chip in [
                    {label: req.account_age_days+' '+langStore.t.adminDaysSuffixShort, ok: req.account_age_days>=14},
                    {label: req.post_count+' '+langStore.t.posts, ok: req.post_count>=3},
                    {label: langStore.t.avatarBtnLabel, ok: req.has_avatar},
                    {label: langStore.t.complBioLabel, ok: req.has_bio},
                    {label: 'Email', ok: req.has_email},
                    {label: req.follower_count+' '+langStore.t.adminFollowersSuffixShort, ok: req.follower_count>=5},
                  ]" :key="chip.label"
                    class="text-[10.5px] font-semibold inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md flex-shrink-0"
                    :class="chip.ok ? 'text-emerald-400/90 bg-emerald-500/[0.07]' : 'text-rose-400/80 bg-rose-500/[0.06]'">
                    <BIcon :name="chip.ok ? 'Check' : 'X'" class="w-2.5 h-2.5 flex-shrink-0" /> {{ chip.label }}
                  </span>
                </div>

                <!-- Evidence -->
                <div v-if="req.evidence_urls?.length || req.evidence_text" class="px-4 mt-2.5 flex flex-col gap-2 min-w-0">
                  <div v-if="req.evidence_text" class="min-w-0">
                    <p class="text-sm text-white/75 whitespace-pre-line line-clamp-3 break-words">{{ req.evidence_text }}</p>
                  </div>
                  <div v-if="req.evidence_urls?.length" class="flex items-center gap-1.5 overflow-x-auto min-w-0 pb-0.5">
                    <button v-for="(url,i) in req.evidence_urls" :key="i"
                      @click="openEvidenceLightbox(req.evidence_urls, i)"
                      class="relative w-14 h-14 rounded-lg overflow-hidden border border-white/[0.08] hover:border-blue-500/40 transition-colors flex-shrink-0 group/ev">
                      <img :src="url" class="w-full h-full object-cover" />
                      <div class="absolute inset-0 bg-black/0 group-hover/ev:bg-black/20 transition-colors" />
                    </button>
                  </div>
                </div>
                <p v-else class="px-4 mt-2 text-[11px] text-white/25">{{ langStore.t.adminNoEvidenceLabel }}</p>

                <!-- Footer actions -->
                <div v-if="req.status === 'pending'" class="mt-3 border-t border-white/[0.06] bg-white/[0.015] px-4 py-2.5 flex gap-2">
                  <button @click="reviewVerRequest(req.id,'approve')"
                    class="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5">
                    <BIcon name="Check" class="w-3.5 h-3.5" /> {{ langStore.t.adminApproveBtn }}
                  </button>
                  <button @click="rejectVerRequest(req.id)"
                    class="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-1.5">
                    <BIcon name="X" class="w-3.5 h-3.5" /> {{ langStore.t.adminRejectBtn }}
                  </button>
                </div>
                <div v-else class="h-3.5" />
              </div>
            </div>
          </div>

          <PostLightbox v-if="evidenceLightbox"
            :images="evidenceLightbox.images"
            :start-index="evidenceLightbox.start"
            @close="evidenceLightbox = null" />
        </div>

        <!-- ── AVATAR FRAMES (Dealers' Den submissions) ──────────────────── -->
        <div v-else-if="activeTab === 'frames'">
          <div class="flex gap-2 mb-5 flex-wrap">
            <button v-for="s in (['', 'pending', 'approved', 'rejected'] as const)" :key="s"
              @click="frameFilter = s; fetchFrameSubmissions()"
              class="px-4 py-2 rounded-2xl text-xs font-bold border transition-all"
              :class="frameFilter === s
                ? 'bg-blue-500/15 border-blue-500/25 text-blue-400'
                : 'bg-white/5 border-white/[0.08] text-white/40 hover:text-white/70'">
              {{ { '': langStore.t.tabAll, pending: langStore.t.adminVerFilterPending, approved: langStore.t.adminVerFilterApproved, rejected: langStore.t.adminVerFilterRejected }[s] }}
            </button>
          </div>

          <div class="space-y-3">
            <div v-if="isLoadingFrames">
              <div v-for="n in 3" :key="n" class="h-28 rounded-3xl bg-white/5 animate-pulse" />
            </div>
            <div v-else-if="frameSubmissions.length === 0"
              class="flex flex-col items-center gap-3 py-20 text-white/25">
              <BIcon name="CircleDashed" class="w-10 h-10 opacity-40" />
              <p class="text-sm font-semibold">{{ langStore.t.adminFramesQueueEmpty }}</p>
            </div>
            <div v-else class="space-y-3">
              <div v-for="fr in frameSubmissions" :key="fr.id"
                class="w-full max-w-full rounded-2xl border overflow-hidden transition-colors"
                :class="fr.status==='pending'
                  ? 'border-amber-500/30 bg-amber-500/[0.05] hover:border-amber-500/50'
                  : fr.status==='approved'
                    ? 'border-emerald-500/30 bg-emerald-500/[0.05] hover:border-emerald-500/50'
                    : 'border-rose-500/30 bg-rose-500/[0.05] hover:border-rose-500/50'">

                <div class="flex items-center gap-3 px-4 pt-3.5 pb-2.5 min-w-0">
                  <div class="relative w-12 h-12 flex-shrink-0">
                    <div class="w-12 h-12 rounded-full bg-white/5 border border-white/10 overflow-hidden">
                      <img v-if="fr.creator?.avatar_url" :src="fr.creator.avatar_url" class="w-full h-full object-cover" />
                    </div>
                    <img :src="fr.image_url" class="absolute inset-0 w-full h-full object-contain pointer-events-none"
                      :style="{ transform: `translate(${fr.default_offset_x*100}%, ${fr.default_offset_y*100}%) rotate(${fr.default_rotation}deg) scale(${fr.default_scale})` }" />
                  </div>
                  <router-link :to="`/profile/${fr.creator?.username}`" target="_blank" class="min-w-0 group/user">
                    <p class="font-bold text-[13px] text-white group-hover/user:text-blue-400 transition-colors truncate">{{ fr.creator?.display_name || fr.creator?.username }}</p>
                    <p class="text-[11px] text-white/35 truncate">@{{ fr.creator?.username }}</p>
                  </router-link>
                  <div class="flex items-center gap-2 flex-shrink-0 ml-auto">
                    <span class="text-xs font-extrabold px-2.5 py-1 rounded-full border"
                      :class="fr.status==='pending'
                        ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                        : fr.status==='approved'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : 'text-rose-400 bg-rose-500/10 border-rose-500/20'">
                      {{ {pending: langStore.t.adminVerStatusPending, approved: langStore.t.adminVerStatusApproved, rejected: langStore.t.adminVerStatusRejected}[fr.status] }}
                    </span>
                    <span class="text-[10px] text-white/25 whitespace-nowrap">{{ formatDate(fr.created_at) }}</span>
                  </div>
                </div>

                <div class="px-4 pb-3 flex items-center gap-2 min-w-0">
                  <p class="font-bold text-sm text-white truncate">{{ fr.name }}</p>
                  <span class="text-xs text-white/35 flex-shrink-0">{{ fr.price === '0' || fr.price === 0 ? 'FREE' : fr.price }}</span>
                </div>

                <div v-if="fr.status === 'pending'" class="border-t border-white/[0.06] bg-white/[0.015] px-4 py-2.5 flex gap-2">
                  <button @click="reviewFrameSubmission(fr.id,'approve')"
                    class="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5">
                    <BIcon name="Check" class="w-3.5 h-3.5" /> {{ langStore.t.adminFrameApprove }}
                  </button>
                  <button @click="rejectFrameSubmission(fr.id)"
                    class="flex-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500/10 border border-rose-500/15 text-rose-400 hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-1.5">
                    <BIcon name="X" class="w-3.5 h-3.5" /> {{ langStore.t.adminFrameReject }}
                  </button>
                </div>
                <div v-else class="h-3.5" />
              </div>
            </div>
          </div>
        </div>

        <!-- ── AUTOMOD ────────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'automod'">
          <!-- Filters -->
          <div class="flex items-center gap-2 mb-5 flex-wrap">
            <select v-model="autoModActionFilter" @change="autoModPage=1; fetchAutoModLogs()"
              class="bg-[#1F223C] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 outline-none focus:border-rose-500/40 cursor-pointer">
              <option value="">{{ langStore.t.adminAllActionsOption }}</option>
              <option value="warn">⚠️ warn</option>
              <option value="freeze">🧊 freeze</option>
              <option value="unfreeze">🔓 unfreeze</option>
              <option value="ban">🚫 ban</option>
              <option value="flag_post">🚩 flag_post</option>
              <option value="clear_warns">✖ clear_warns</option>
            </select>
            <select v-model="autoModCategoryFilter" @change="autoModPage=1; fetchAutoModLogs()"
              class="bg-[#1F223C] border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 outline-none focus:border-rose-500/40 cursor-pointer">
              <option value="">{{ langStore.t.adminAllCategoriesOption }}</option>
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
            <span class="ml-auto text-xs font-bold text-white/30 bg-white/5 px-3 py-2 rounded-xl border border-white/[0.08]">{{ autoModTotal }} {{ langStore.t.adminEventsSuffix }}</span>
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
              <p class="text-sm font-semibold">{{ langStore.t.adminLogEmpty }}</p>
              <p class="text-xs">{{ langStore.t.adminAutoModNoViolations }}</p>
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
              <BIcon name="Sticker" class="w-4 h-4" /> {{ langStore.t.stickers }}
            </button>
            <button @click="statsSubTab='network'"
              class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
              :class="statsSubTab==='network'
                ? 'text-white border border-emerald-500/30'
                : 'text-white/40 hover:text-white/70 bg-white/[0.03] border border-brand-border'"
              :style="statsSubTab==='network' ? 'background:rgba(16,185,129,0.12)' : ''">
              <BIcon name="Globe" class="w-4 h-4" /> {{ langStore.t.adminNetworkLabel }}
            </button>
            <button @click="statsSubTab='infra'; if (!infraOverview) fetchInfraOverview()"
              class="flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold transition-all"
              :class="statsSubTab==='infra'
                ? 'text-white border border-emerald-500/30'
                : 'text-white/40 hover:text-white/70 bg-white/[0.03] border border-brand-border'"
              :style="statsSubTab==='infra' ? 'background:rgba(16,185,129,0.12)' : ''">
              <BIcon name="Server" class="w-4 h-4" /> {{ langStore.t.adminNavInfra }}
            </button>
            <button @click="statsSubTab==='infra' ? (infraOverview=null, fetchInfraOverview()) : (stickerStats=null, networkStats=null, fetchStatistics())"
              class="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs text-white/40 hover:text-white bg-white/[0.03] border border-brand-border transition-all">
              <BIcon name="RefreshCw" class="w-3.5 h-3.5" /> {{ langStore.t.adminRefreshBtn }}
            </button>
          </div>

          <!-- Loading skeleton -->
          <template v-if="statsSubTab !== 'infra' && isLoadingStatistics">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div v-for="n in 4" :key="n" class="rounded-3xl border border-brand-border p-6 animate-pulse" style="background:#1F223C">
                <div class="h-4 bg-white/[0.08] rounded-full w-32 mb-4" />
                <div class="space-y-2">
                  <div v-for="i in 5" :key="i" class="h-6 bg-white/5 rounded-xl" :style="`width:${60+i*8}%`" />
                </div>
              </div>
            </div>
          </template>

          <!-- ─── INFRASTRUCTURE sub-tab loading ──────────────────────── -->
          <template v-else-if="statsSubTab === 'infra' && isLoadingInfra">
            <div class="space-y-5">
              <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <div v-for="n in 3" :key="n" class="h-24 rounded-2xl bg-white/5 animate-pulse" />
              </div>
              <div class="h-56 rounded-2xl bg-white/5 animate-pulse" />
            </div>
          </template>

          <!-- ─── STICKERS sub-tab ─────────────────────────────────── -->
          <template v-else-if="statsSubTab === 'stickers' && stickerStats">

            <!-- Top row summary -->
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminPacksTotalLabel }}</p>
                <p class="text-2xl font-black text-white">{{ formatNum(stickerStats.totals.totalPacks) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTop1UsageLabel }}</p>
                <p class="text-2xl font-black text-emerald-400">{{ formatNum(stickerStats.topPacks[0]?.use_count ?? 0) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTop1DownloadsLabel }}</p>
                <p class="text-2xl font-black text-indigo-400">{{ formatNum(stickerStats.topPacks[0]?.downloads_count ?? 0) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminUniqueStickersLabel }}</p>
                <p class="text-2xl font-black text-white">{{ formatNum(stickerStats.totals.uniqueStickers) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTotalDownloadsLabel }}</p>
                <p class="text-2xl font-black text-sky-400">{{ formatNum(stickerStats.totals.totalDownloads) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTotalFavoritesLabel }}</p>
                <p class="text-2xl font-black text-rose-400">{{ formatNum(stickerStats.totals.totalFavorites) }}</p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

              <!-- Top Packs list -->
              <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
                <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
                  <BIcon name="TrendingUp" class="w-4 h-4 text-emerald-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminTopStickerPacksTitle }}</h3>
                  <span class="ml-auto text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{{ langStore.t.adminByUsageLabel }}</span>
                </div>
                <div class="divide-y divide-brand-border">
                  <div v-for="(pack, idx) in stickerStats.topPacks.slice(0,10)" :key="pack.id"
                    @click="openStickerPackDetail(pack.id)"
                    class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.05] transition-all cursor-pointer">
                    <span class="w-5 text-center text-xs font-black"
                      :class="idx===0?'text-yellow-400':idx===1?'text-slate-300':idx===2?'text-amber-600':'text-white/20'">
                      {{ idx+1 }}
                    </span>
                    <div class="w-9 h-9 rounded-xl flex-shrink-0 overflow-hidden border border-white/10"
                      :style="pack.cover_bg_color ? `background:${pack.cover_bg_color}` : 'background:rgba(255,255,255,0.05)'">
                      <img v-if="packThumb(pack)" :src="packThumb(pack)" class="w-full h-full object-cover" />
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
                      <p class="text-[10px] text-white/25">{{ formatNum(pack.downloads_count) }} {{ langStore.t.adminDownloadsShortSuffix }}</p>
                    </div>
                    <BIcon name="ChevronRight" class="w-4 h-4 text-white/20 flex-shrink-0" />
                  </div>
                </div>
              </div>

              <!-- Daily usage chart -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="Activity" class="w-4 h-4 text-emerald-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminStickerUsageTitle }}</h3>
                  <span class="ml-auto text-[10px] text-white/30">{{ langStore.t.adminLast30DaysLabel }}</span>
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
                <p v-else class="text-center text-sm text-white/25 py-12">{{ langStore.t.adminNoDataLabel }}</p>
              </div>
            </div>

            <!-- By Age / Species / Country charts -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">

              <!-- By Age -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="CalendarDays" class="w-4 h-4 text-indigo-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminByAgeTitle }}</h3>
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
                <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
              </div>

              <!-- By Species -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="PawPrint" class="w-4 h-4 text-amber-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminBySpeciesTitle }}</h3>
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
                <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
              </div>

              <!-- By Country -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="MapPin" class="w-4 h-4 text-rose-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminByCountryTitle }}</h3>
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
                <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
              </div>
            </div>

            <!-- Top individual stickers -->
            <div class="rounded-3xl border border-brand-border p-5 mt-4" style="background:#1F223C">
              <div class="flex items-center gap-2 mb-4">
                <BIcon name="Sparkles" class="w-4 h-4 text-fuchsia-400" />
                <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminTopStickersTitle }}</h3>
                <span class="ml-auto text-[10px] font-bold text-white/30 bg-white/5 px-2 py-0.5 rounded-full">{{ langStore.t.adminByUsageLabel }}</span>
              </div>
              <div v-if="stickerStats.topStickers.length" class="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-9 lg:grid-cols-12 gap-3">
                <div v-for="s in stickerStats.topStickers" :key="s.url"
                  @click="s.packId && openStickerPackDetail(s.packId)"
                  class="group relative rounded-xl overflow-hidden border border-white/10 aspect-square bg-white/[0.03]"
                  :class="s.packId ? 'cursor-pointer hover:border-fuchsia-400/40' : ''"
                  :title="s.packName ?? ''">
                  <img :src="s.url" class="w-full h-full object-contain p-1" loading="lazy" />
                  <span class="absolute bottom-0 right-0 text-[9px] font-black text-white bg-black/70 px-1.5 py-0.5 rounded-tl-lg">
                    {{ formatNum(s.total) }}
                  </span>
                </div>
              </div>
              <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
            </div>

          </template>

          <!-- ─── NETWORK sub-tab ─────────────────────────────────── -->
          <template v-else-if="statsSubTab === 'network' && networkStats">

            <!-- Summary cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminStatTotalUsers }}</p>
                <p class="text-2xl font-black text-white">{{ formatNum(networkStats.totalUsers) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTotalGroupsLabel }}</p>
                <p class="text-2xl font-black text-purple-400">{{ formatNum(networkStats.totalGroups) }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTopCountryLabel }}</p>
                <p class="text-lg font-black text-white truncate">{{ topKnownCountryLabel }}</p>
              </div>
              <div class="rounded-2xl border border-brand-border px-4 py-3" style="background:rgba(255,255,255,0.03)">
                <p class="text-[10px] font-bold text-white/35 uppercase tracking-wide mb-1">{{ langStore.t.adminTopSpeciesLabel }}</p>
                <p class="text-lg font-black text-white truncate capitalize">{{ networkStats.usersBySpecies[0]?.label ?? '—' }}</p>
              </div>
            </div>

            <!-- Charts row 1 -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

              <!-- Registrations history -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="UserPlus" class="w-4 h-4 text-indigo-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminRegistrationsTitle }}</h3>
                  <span class="ml-auto text-[10px] text-white/30">{{ langStore.t.adminLast30DaysLabel }}</span>
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
                <p v-else class="text-center text-sm text-white/25 py-12">{{ langStore.t.adminNoDataLabel }}</p>
              </div>

              <!-- Posts history -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="FileText" class="w-4 h-4 text-sky-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.postsTab }}</h3>
                  <span class="ml-auto text-[10px] text-white/30">{{ langStore.t.adminLast30DaysLabel }}</span>
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
                <p v-else class="text-center text-sm text-white/25 py-12">{{ langStore.t.adminNoDataLabel }}</p>
              </div>
            </div>

            <!-- Charts row 2: by species / country / age / pronouns -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

              <!-- By Species -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="PawPrint" class="w-4 h-4 text-amber-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminUsersBySpeciesTitle }}</h3>
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
                <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
              </div>

              <!-- By Country -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="Globe" class="w-4 h-4 text-emerald-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminUsersByCountryTitle }}</h3>
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
                <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

              <!-- By Age -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="CalendarDays" class="w-4 h-4 text-indigo-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminUsersByAgeTitle }}</h3>
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
                <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
              </div>

              <!-- By Pronouns -->
              <div class="rounded-3xl border border-brand-border p-5" style="background:#1F223C">
                <div class="flex items-center gap-2 mb-4">
                  <BIcon name="Heart" class="w-4 h-4 text-pink-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminUsersByPronounTitle }}</h3>
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
                <p v-else class="text-center text-sm text-white/25 py-8">{{ langStore.t.adminNoDataLabel }}</p>
              </div>
            </div>

            <!-- Top posters + most followed -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">

              <!-- Top posters -->
              <div class="rounded-3xl border border-brand-border overflow-hidden" style="background:#1F223C">
                <div class="px-5 py-4 border-b border-brand-border flex items-center gap-2">
                  <BIcon name="Pencil" class="w-4 h-4 text-sky-400" />
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminTopPostersTitle }}</h3>
                </div>
                <div class="divide-y divide-brand-border">
                  <div v-for="(u, idx) in networkStats.topPosters" :key="u.userId"
                    @click="u.username && router.push({ name: 'profile', params: { username: u.username } })"
                    class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.05] transition-all cursor-pointer">
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
                  <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminMostFollowedTitle }}</h3>
                  <span class="ml-auto text-[10px] text-white/30">{{ langStore.t.adminByFollowersLabel }}</span>
                </div>
                <div class="divide-y divide-brand-border">
                  <div v-for="(u, idx) in networkStats.mostFollowed" :key="u.userId"
                    @click="u.username && router.push({ name: 'profile', params: { username: u.username } })"
                    class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.05] transition-all cursor-pointer">
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
                <h3 class="font-extrabold text-sm text-white">{{ langStore.t.adminTopGroupsTitle }}</h3>
                <span class="ml-auto text-[10px] text-white/30">{{ langStore.t.adminByMembersLabel }}</span>
              </div>
              <div class="divide-y divide-brand-border">
                <div v-for="(g, idx) in networkStats.topGroups" :key="g.id"
                  @click="router.push({ name: 'group-detail', params: { slugOrId: g.id } })"
                  class="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.05] transition-all cursor-pointer">
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

          <!-- ─── INFRASTRUCTURE sub-tab ─────────────────────────────── -->
          <template v-else-if="statsSubTab === 'infra' && infraOverview">
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminS3UsedLabel }}</p>
                <p class="text-2xl font-black text-white">{{ formatBytes(infraOverview.storage.totalBytes) }}</p>
                <p class="text-xs font-semibold text-brand-accent mt-1">{{ formatNum(infraOverview.storage.totalObjects) }} {{ langStore.t.adminFilesSuffix }}</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminStickersInSystemLabel }}</p>
                <p class="text-2xl font-black text-white">{{ formatNum(infraOverview.stickers.fileCount) }}</p>
                <p class="text-xs font-semibold text-emerald-400 mt-1">{{ langStore.t.adminInPrefix }} {{ infraOverview.stickers.packCount }} {{ langStore.t.adminPacksUsageSuffix }}</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminDealersDenLotsLabel }}</p>
                <p class="text-2xl font-black text-white">{{ infraOverview.dealersDen.activeListings }}</p>
                <p class="text-xs font-semibold text-amber-400 mt-1">{{ infraOverview.dealersDen.soldThisMonthCount }} {{ langStore.t.adminSalesThisMonthSuffix }}</p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-5">
              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminS3StorageTitle }}</h3>
                <p class="text-xs text-white/40 mb-3">{{ formatBytes(infraOverview.storage.totalBytes) }} {{ langStore.t.adminInPrefix }} {{ infraOverview.storage.totalObjects }} {{ langStore.t.adminFilesLocativeSuffix }}</p>
                <div v-for="f in infraOverview.storage.byFolder" :key="f.folder" class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-semibold text-white/60">{{ FOLDER_LABEL[f.folder] ?? f.folder }}</span>
                    <span class="text-xs font-bold text-white">{{ formatBytes(f.bytes) }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full bg-brand-accent" :style="`width:${Math.round((f.bytes / infraOverview.storage.totalBytes) * 100)}%`" />
                  </div>
                </div>
                <p v-if="!infraOverview.storage.byFolder.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminStorageEmpty }}</p>
              </div>
            </div>
          </template>

          <!-- Empty state when no data yet -->
          <div v-else-if="(statsSubTab === 'infra' && !isLoadingInfra) || (statsSubTab !== 'infra' && !isLoadingStatistics)" class="flex flex-col items-center gap-4 py-24 text-white/25">
            <BIcon name="BarChart2" class="w-12 h-12 opacity-30" />
            <p class="text-sm font-semibold">{{ langStore.t.adminNoDataLabel }}</p>
          </div>

        </div>

        <!-- ── Bloomly Updates Tab ─────────────────────────────────────── -->
        <div v-else-if="activeTab === 'updates'" class="space-y-6">

          <!-- Segmented toggle: changelog updates vs push broadcasts (merged from the old separate tab) -->
          <div class="flex items-center gap-2 p-1 rounded-2xl bg-white/[0.04] w-fit">
            <button type="button" @click="switchCommsView('updates')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="commsViewMode === 'updates' ? 'bg-[#4C67CF]/20 text-[#4C67CF]' : 'text-white/40 hover:text-white/70'">
              <BIcon name="Sparkles" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavUpdates }}
            </button>
            <button type="button" @click="switchCommsView('broadcasts')"
              class="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              :class="commsViewMode === 'broadcasts' ? 'bg-violet-500/20 text-violet-400' : 'text-white/40 hover:text-white/70'">
              <BIcon name="Send" class="w-3.5 h-3.5" /> {{ langStore.t.adminNavBroadcasts }}
            </button>
          </div>

          <template v-if="commsViewMode === 'updates'">

          <!-- Create form -->
          <div class="relative rounded-3xl border border-brand-border p-6 space-y-4 overflow-hidden" style="background:#1F223C">
            <div class="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-20 pointer-events-none"
              style="background:radial-gradient(circle,#7c3aed,transparent 70%)" />
            <div class="flex items-center gap-3 mb-2 relative">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-[#4C67CF] to-[#7c3aed] flex items-center justify-center flex-shrink-0 shadow-lg shadow-[#4C67CF]/20">
                <span class="text-white font-black text-sm select-none">B</span>
              </div>
              <h3 class="font-extrabold text-white">{{ langStore.t.adminNewUpdateTitle }}</h3>
              <span class="text-xs text-white/30 ml-auto flex items-center gap-1">
                <BIcon name="Sparkles" class="w-3.5 h-3.5" /> {{ langStore.t.adminUpdateShownFirstHint }}
              </span>
            </div>

            <input
              v-model="newUpdateTitle"
              class="adm-input relative"
              :placeholder="langStore.t.adminUpdateTitlePlaceholderExample"
              maxlength="120"
            />
            <textarea
              v-model="newUpdateBody"
              class="adm-input resize-none relative"
              rows="3"
              :placeholder="langStore.t.adminUpdateBodyPlaceholder"
              maxlength="800"
            />
            <div v-if="newUpdateImageUrl" class="relative flex items-center gap-3 p-3 bg-white/5 border border-white/[0.08] rounded-2xl">
              <img :src="newUpdateImageUrl" class="w-20 h-12 object-cover rounded-xl flex-shrink-0 border border-white/10" />
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold text-white/70">{{ langStore.t.adminCoverUploadedLabel }}</p>
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
              class="relative flex items-center gap-2 px-6 py-2.5 rounded-2xl font-bold text-sm text-white transition-all disabled:opacity-40 shadow-lg shadow-[#4C67CF]/20"
              style="background:linear-gradient(135deg,#4C67CF,#7c3aed)"
            >
              <BIcon v-if="isSavingUpdate" name="Loader2" class="w-4 h-4 animate-spin" />
              <BIcon v-else name="Send" class="w-4 h-4" />
              <span v-if="isSavingUpdate">{{ langStore.t.adminPublishingLabel }}</span>
              <span v-else>{{ langStore.t.adminPublishUpdateBtn }}</span>
            </button>
          </div>

          <!-- Updates list -->
          <div v-if="isLoadingUpdates" class="flex items-center justify-center py-16">
            <BIcon name="Loader2" class="w-8 h-8 text-white/30 animate-spin" />
          </div>
          <div v-else-if="updates.length === 0" class="flex flex-col items-center gap-4 py-20 text-white/25 rounded-3xl border border-brand-border" style="background:#1F223C">
            <BIcon name="Megaphone" class="w-12 h-12 opacity-30" />
            <p class="text-sm font-semibold">{{ langStore.t.adminNoUpdatesYet }}</p>
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              v-for="u in updates"
              :key="u.id"
              class="relative rounded-3xl border overflow-hidden transition-all group"
              :class="u.is_active ? 'border-[#4C67CF]/25 hover:border-[#4C67CF]/45' : 'border-brand-border opacity-55 hover:opacity-80'"
              style="background:#1F223C"
            >
              <!-- Cover banner -->
              <div class="relative h-28 w-full overflow-hidden flex-shrink-0">
                <img v-if="u.image_url" :src="u.image_url"
                  class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                <div v-else class="w-full h-full flex items-center justify-center relative overflow-hidden"
                  style="background:linear-gradient(135deg,#4C67CF,#7c3aed)">
                  <span class="text-white/25 font-black text-7xl select-none absolute -right-2 -bottom-4">B</span>
                  <BIcon name="Sparkles" class="w-8 h-8 text-white/70 relative" />
                </div>
                <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <span class="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-extrabold px-2 py-1 rounded-full backdrop-blur-sm"
                  :class="u.is_active ? 'bg-emerald-500/85 text-white' : 'bg-white/15 text-white/70'">
                  <span class="w-1.5 h-1.5 rounded-full" :class="u.is_active ? 'bg-white' : 'bg-white/50'" />
                  {{ u.is_active ? langStore.t.adminActiveShort : langStore.t.adminHiddenShort }}
                </span>
                <p class="absolute bottom-2.5 left-4 right-4 font-extrabold text-white text-sm truncate drop-shadow">{{ u.title }}</p>
              </div>

              <!-- Content -->
              <div class="p-4 flex flex-col gap-3">
                <p v-if="u.body" class="text-xs text-white/50 line-clamp-2">{{ u.body }}</p>
                <div class="flex items-center justify-between gap-2 pt-1">
                  <span class="text-[11px] text-white/25 flex items-center gap-1">
                    <BIcon name="Clock" class="w-3 h-3" /> {{ formatDate(u.created_at) }}
                  </span>
                  <div class="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      @click="toggleUpdate(u.id, !u.is_active)"
                      class="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                      :class="u.is_active
                        ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                        : 'bg-white/[0.06] text-white/40 hover:bg-white/10'"
                    >
                      {{ u.is_active ? langStore.t.adminActiveShort : langStore.t.adminHiddenShort }}
                    </button>
                    <button
                      @click="deleteUpdate(u.id)"
                      class="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all flex items-center justify-center"
                      :title="langStore.t.deleteBtn"
                    >
                      <BIcon name="Trash2" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          </template>

          <template v-else>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
              <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminNewBroadcastTitle }}</h3>
              <div class="space-y-3">
                <input v-model="broadcastTitle" :placeholder="langStore.t.adminNotificationTitlePlaceholder" class="adm-input" />
                <textarea v-model="broadcastBody" :placeholder="langStore.t.adminMessageTextPlaceholder" class="adm-input resize-none h-28" />
                <select v-model="broadcastAudience" class="adm-input">
                  <option value="all">{{ langStore.t.adminAudienceAll }}</option>
                  <option value="premium">{{ langStore.t.adminAudiencePremium }}</option>
                  <option value="new">{{ langStore.t.adminAudienceNew }}</option>
                  <option value="staff">{{ langStore.t.adminAudienceStaff }}</option>
                </select>
                <button @click="sendBroadcast" :disabled="isSendingBroadcast || !broadcastTitle.trim() || !broadcastBody.trim()"
                  class="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold text-white disabled:opacity-40 transition-all shadow-lg"
                  style="background:linear-gradient(135deg,#4C67CF,#8b5cf6)">
                  <BIcon name="Send" class="w-4 h-4" /> {{ isSendingBroadcast ? langStore.t.adminSendingLabel : langStore.t.adminSendBroadcastBtn }}
                </button>
              </div>
            </div>

            <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
              <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminBroadcastHistoryTitle }}</h3>
              <div v-if="isLoadingBroadcasts" class="space-y-3">
                <div v-for="n in 3" :key="n" class="h-12 rounded-xl bg-white/5 animate-pulse" />
              </div>
              <div v-else-if="!broadcasts.length" class="text-xs text-white/25 text-center py-10">{{ langStore.t.adminNoBroadcastsYet }}</div>
              <div v-else class="divide-y divide-brand-border -mx-1">
                <div v-for="b in broadcasts" :key="b.id" class="py-3 px-1">
                  <p class="font-bold text-sm text-white">{{ b.title }}</p>
                  <p class="text-xs text-white/40 mt-0.5">{{ AUDIENCE_LABEL[b.audience] ?? b.audience }} · {{ formatDate(b.created_at) }} · {{ b.recipient_count }} {{ langStore.t.adminRecipientsSuffix }} · {{ b.opens }} {{ langStore.t.adminOpensSuffix }}</p>
                </div>
              </div>
            </div>
          </div>
          </template>
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
            <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">{{ langStore.t.groups }}</h2>
            <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
              <router-link v-for="g in groupsOverview.groups" :key="g.id" :to="`/groups/${g.slug}`" target="_blank"
                class="rounded-2xl border border-brand-border bg-brand-card p-4 hover:border-brand-accent/30 transition-all overflow-hidden relative">
                <div class="absolute top-0 left-0 right-0 h-[3px] bg-brand-accent" />
                <p class="font-bold text-white text-sm truncate mt-1">{{ g.name }}</p>
                <p class="text-xs text-white/35 mt-0.5">{{ GROUP_TYPE_LABEL[g.type] ?? g.type }}</p>
                <p class="text-xs text-white/50 mt-2 flex items-center gap-1.5">
                  <BIcon name="Users" class="w-3.5 h-3.5" /> {{ formatNum(g.memberCount) }} {{ langStore.t.adminParticipantsSuffix }}
                </p>
              </router-link>
              <p v-if="!groupsOverview.groups.length" class="col-span-full text-center text-sm text-white/25 py-10">{{ langStore.t.adminNoGroupsYet }}</p>
            </div>

            <h2 class="text-xs font-extrabold text-white/30 tracking-[0.15em] uppercase mb-3">{{ langStore.t.adminUpcomingEventsTitle }}</h2>
            <div class="rounded-2xl border border-brand-border bg-brand-card overflow-hidden">
              <div class="hidden lg:grid gap-3 px-5 py-3 border-b border-brand-border grid-cols-[2fr_1.5fr_1fr_1fr_0.8fr]">
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColEvent }}</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColGroup }}</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColDate }}</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.adminColParticipants }}</span>
                <span class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider">{{ langStore.t.statusFieldLabel }}</span>
              </div>
              <div v-if="!groupsOverview.events.length" class="flex flex-col items-center gap-3 py-16 text-white/25">
                <BIcon name="CalendarDays" class="w-10 h-10 opacity-40" />
                <p class="text-sm font-semibold">{{ langStore.t.adminNoEventsFound }}</p>
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
                    {{ e.isUpcoming ? langStore.t.adminUpcomingLabel : langStore.t.adminPastLabel }}
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
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminStatWithSub }}</p>
                <p class="text-2xl font-black text-white">{{ formatNum(premiumOverview.total - freeUserCount) }}</p>
                <p class="text-xs font-semibold text-brand-accent mt-1">{{ langStore.t.adminSubOutOf }} {{ formatNum(premiumOverview.total) }} {{ langStore.t.adminSubUsersGenitive }}</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminPremiumShareLabel }}</p>
                <p class="text-2xl font-black text-white">{{ premiumShare }}%</p>
                <p class="text-xs font-semibold text-emerald-400 mt-1">{{ langStore.t.adminOfAllUsersLabel }}</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminTopTierLabel }}</p>
                <p class="text-2xl font-black text-white">{{ tierLabel(paidTierBreakdown[0]?.tier) ?? '—' }}</p>
                <p class="text-xs font-semibold text-amber-400 mt-1">{{ formatNum(paidTierBreakdown[0]?.count ?? 0) }} {{ langStore.t.adminSubscribersSuffix }}</p>
              </div>
              <div class="rounded-2xl p-4 border border-brand-border bg-brand-card">
                <p class="text-[10px] font-extrabold text-white/35 uppercase tracking-wider mb-2">{{ langStore.t.adminNoSubscription }}</p>
                <p class="text-2xl font-black text-white">{{ formatNum(freeUserCount) }}</p>
                <p class="text-xs font-semibold text-white/40 mt-1">{{ langStore.t.adminFreeTierLabel }}</p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminTierBreakdownTitle }}</h3>
                <div v-for="t in paidTierBreakdown" :key="t.tier" class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-semibold" :style="`color:${tierColor(t.tier)}`">{{ tierLabel(t.tier) }}</span>
                    <span class="text-xs font-bold text-white">{{ formatNum(t.count) }} {{ langStore.t.adminSubscribersSuffix }}</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full rounded-full" :style="`width:${Math.round((t.count / barMax(paidTierBreakdown.map((x:any)=>({value:x.count})))) * 100)}%;background:${tierColor(t.tier)}`" />
                  </div>
                </div>
                <p v-if="!paidTierBreakdown.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoPaidSubscribersYet }}</p>
              </div>

              <div class="rounded-2xl border border-brand-border bg-brand-card p-5">
                <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminPremiumSubscribersTitle }}</h3>
                <div v-if="!premiumOverview.topSubscribers.length" class="text-xs text-white/25 text-center py-6">{{ langStore.t.adminNoOneSubscribedYet }}</div>
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
                  <h3 class="font-extrabold text-white text-sm">{{ langStore.t.adminDealersDenTurnoverTitle }}</h3>
                  <p class="text-xs text-white/40 mt-0.5">{{ langStore.t.adminDealersDenTurnoverDesc }}</p>
                </div>
                <span class="text-xs font-bold px-3 py-1.5 rounded-full bg-brand-accent/15 text-brand-accent flex-shrink-0">
                  ${{ formatNum(premiumOverview.dealersDen.totalGmv) }} {{ langStore.t.adminTotalLowercase }} · {{ premiumOverview.dealersDen.soldCount }} {{ langStore.t.adminSalesSuffix }}
                </span>
              </div>
              <div v-if="gmvMonths.length" class="flex items-end gap-1.5 h-28 mt-4">
                <div v-for="(m, idx) in gmvMonths" :key="idx"
                  class="flex-1 flex flex-col items-center gap-1 group/bar cursor-default relative">
                  <div class="absolute -top-7 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100
                    text-[9px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-lg whitespace-nowrap transition-opacity pointer-events-none">
                    ${{ m.total }} · {{ m.count }} {{ langStore.t.adminUnitsShortSuffix }}
                  </div>
                  <div class="w-full rounded-t-lg transition-all hover:opacity-100 opacity-80 bg-brand-accent"
                    :style="`height:${Math.max(4, (m.total / gmvMax) * 100)}px`" />
                </div>
              </div>
              <div v-if="gmvMonths.length" class="flex justify-between mt-2 px-0.5">
                <span class="text-[10px] text-white/30">{{ formatMonthShort(gmvMonths[0].month) }}</span>
                <span class="text-[10px] text-white/30">{{ formatMonthShort(gmvMonths[gmvMonths.length-1].month) }}</span>
              </div>
              <p v-else class="text-xs text-white/25 text-center py-8">{{ langStore.t.adminNoSalesYet }}</p>
            </div>
          </template>
        </div>

        <!-- ── NOTIFICATIONS / BROADCASTS ─────────────────────────────── -->

        <!-- ── LOGS & SETTINGS ────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'settings'">
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="rounded-2xl border border-brand-border bg-brand-card p-5 h-fit">
              <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminPlatformSettingsTitle }}</h3>
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
              <h3 class="font-extrabold text-white text-sm mb-4">{{ langStore.t.adminAuditLogTitle }}</h3>
              <div v-if="isLoadingAuditLogs" class="space-y-3">
                <div v-for="n in 5" :key="n" class="h-10 rounded-xl bg-white/5 animate-pulse" />
              </div>
              <div v-else-if="!auditLogs.length" class="text-xs text-white/25 text-center py-10">{{ langStore.t.adminNoActionsYet }}</div>
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

      </div>
      </Transition>
      </main>
    </div>
  </div>

  <StickerPackDetailModal v-if="openedPackId" :pack-id="openedPackId" @close="closeStickerPackDetail" />
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
