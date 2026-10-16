// State the admin panel shell (AdminView) shares with its tab components.
// Lives exactly as long as AdminView: created there, handed to tabs via provide/inject.
import { computed, inject, provide, reactive, ref, type InjectionKey } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { ROLE_RANK } from './adminHelpers'

export type AdminTab = 'overview' | 'users' | 'posts' | 'reports' | 'support' | 'ads' | 'verification' | 'frames'
  | 'automod' | 'statistics' | 'updates' | 'groups' | 'finance' | 'settings'

// Users tab has four views: the user list, team & roles, frozen accounts, banned accounts
export type UsersView = 'all' | 'team' | 'frozen' | 'archived'

export function createAdminContext() {
  const auth = useAuthStore()
  const langStore = useLangStore()

  const myRole = computed<string>(() => auth.user?.role ?? 'user')
  const myRoleRank = computed(() => ROLE_RANK[myRole.value] ?? 0)
  const isOwnerRole = computed(() => myRole.value === 'owner')
  const isAdminPlus = computed(() => myRoleRank.value >= ROLE_RANK.admin)

  // ── Navigation ──────────────────────────────────────────────────────
  const activeTab = ref<AdminTab>('overview')
  const usersView = ref<UsersView>('all')
  // Header search: AdminView puts the query here, the Users tab consumes it
  const userSearchRequest = ref('')
  const switchTab = (tab: AdminTab, opts?: { usersView?: UsersView }) => {
    activeTab.value = tab
    if (opts?.usersView) usersView.value = opts.usersView
  }

  // Sidebar counters, filled in by each tab once it has loaded its list
  const badges = reactive({ users: 0, reports: 0, support: 0, automod: 0, verification: 0, frames: 0, ads: 0, updates: 0 })

  // Bumped by actions that write AutoMod log entries (e.g. unfreeze) so the AutoMod tab refetches
  const automodVersion = ref(0)

  // Shared by the admin tabs: a failed request must never wipe an already-loaded list,
  // it only surfaces a message. 429 (rate-limit) gets its own wording.
  const adminActionError = ref('')
  let adminActionErrorTimer: ReturnType<typeof setTimeout> | undefined
  const reportAdminError = (e: any) => {
    adminActionError.value = e?.response?.status === 429 ? langStore.t.adminRateLimited : langStore.t.adminActionFailed
    clearTimeout(adminActionErrorTimer)
    adminActionErrorTimer = setTimeout(() => { adminActionError.value = '' }, 5000)
  }

  // ── Platform stats (overview, header bell) ──────────────────────────
  const stats = ref<any>(null)
  const isLoadingStats = ref(false)
  const statsError = ref(false)
  const fetchStats = async () => {
    isLoadingStats.value = true
    statsError.value = false
    try {
      const res = await api.get('/admin/stats')
      if (res.data.success) stats.value = res.data.data
      else statsError.value = true
    } catch { statsError.value = true } finally { isLoadingStats.value = false }
  }

  // ── Sticker / network statistics (statistics tab, overview geography) ─
  const stickerStats = ref<any>(null)
  const networkStats = ref<any>(null)
  const isLoadingStatistics = ref(false)
  const fetchStatistics = async () => {
    if (stickerStats.value && networkStats.value) return
    isLoadingStatistics.value = true
    try {
      const [s, n] = await Promise.all([
        api.get('/admin/stats/stickers'),
        api.get('/admin/stats/network'),
      ])
      if (s.data.success) stickerStats.value = s.data.data
      if (n.data.success) networkStats.value = n.data.data
    } catch {} finally { isLoadingStatistics.value = false }
  }

  return {
    myRole, myRoleRank, isOwnerRole, isAdminPlus,
    activeTab, usersView, userSearchRequest, switchTab,
    badges, automodVersion, adminActionError, reportAdminError,
    stats, isLoadingStats, statsError, fetchStats,
    stickerStats, networkStats, isLoadingStatistics, fetchStatistics,
  }
}

export type AdminContext = ReturnType<typeof createAdminContext>

const ADMIN_CONTEXT: InjectionKey<AdminContext> = Symbol('admin-context')

export function provideAdminContext(ctx: AdminContext) {
  provide(ADMIN_CONTEXT, ctx)
}

export function useAdminContext(): AdminContext {
  const ctx = inject(ADMIN_CONTEXT)
  if (!ctx) throw new Error('useAdminContext() called outside AdminView')
  return ctx
}
