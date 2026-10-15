<script setup lang="ts">
import { ref, computed, watch, watchEffect, onMounted, onBeforeUnmount, onActivated } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import api from '@/api'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from '@/components/BIcon.vue'
import AdminEditUserModal from '@/components/AdminEditUserModal.vue'
import { roleLabel, roleColor, tierLabel, tierColor, formatNum, formatDate } from './adminHelpers'
import { useAdminContext, type UsersView } from './adminContext'

const langStore = useLangStore()
const router = useRouter()
const { confirmDialog } = useConfirm()
const { isOwnerRole, isAdminPlus, usersView: usersViewMode, userSearchRequest, badges, automodVersion } = useAdminContext()

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

// Short-lived error banner for per-user actions (tier change, profile edit) — previously these failed silently.
const actionError = ref('')
let actionErrorTimer: ReturnType<typeof setTimeout> | null = null
const showActionError = (message: string) => {
  actionError.value = message
  if (actionErrorTimer) clearTimeout(actionErrorTimer)
  actionErrorTimer = setTimeout(() => { actionError.value = '' }, 5000)
}

const updateUserSubscription = async (userId: string, tier: string) => {
  try {
    await api.patch(`/admin/users/${userId}/subscription`, { tier })
    const u = users.value.find(u => u.id === userId)
    if (u) u.subscription_tier = tier
  } catch (e: any) {
    showActionError(e?.response?.data?.error?.message || 'Не удалось изменить подписку')
  }
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

// ── Staff profile editor for other users ──────────────────────────────
const editingUser = ref<any>(null)
const onUserProfileSaved = (patch: Record<string, string>) => {
  const u = users.value.find(x => x.id === editingUser.value?.id)
  if (u) Object.assign(u, patch)
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

const unfreezeUser = async (userId: string) => {
  try {
    await api.post(`/admin/users/${userId}/unfreeze`)
    const u = users.value.find(u => u.id === userId)
    if (u) { u.frozen_at = null; u.frozen_reason = null }
    frozenUsers.value = frozenUsers.value.filter(u => u.id !== userId)
    frozenTotal.value = Math.max(0, frozenTotal.value - 1)
    automodVersion.value++
  } catch {}
}

const freezeUser = async (userId: string) => {
  const reason = prompt(langStore.t.adminFreezeReasonPrompt) ?? ''
  if (!reason.trim()) return
  try {
    await api.post(`/admin/users/${userId}/freeze`, { reason })
    const u = users.value.find(u => u.id === userId)
    if (u) u.frozen_at = new Date().toISOString()
    if (usersViewMode.value === 'frozen') await fetchFrozenUsers()
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

const switchUsersView = (mode: UsersView) => { usersViewMode.value = mode }
// Each view loads its list the first time it is opened (also when the overview jumps straight to one)
watch(usersViewMode, (mode) => {
  if (mode === 'team' && !staff.value.length) fetchStaff()
  if (mode === 'frozen' && !frozenUsers.value.length) fetchFrozenUsers()
  if (mode === 'archived' && !archivedUsers.value.length) fetchArchivedUsers()
}, { immediate: true })

// Header search in AdminView jumps here with the query pre-filled
const applySearchRequest = () => {
  const q = userSearchRequest.value
  if (!q) return
  userSearchRequest.value = ''
  userSearch.value = q
  userPage.value = 1
  fetchUsers()
}
watch(userSearchRequest, applySearchRequest)

onActivated(() => {
  if (userSearchRequest.value) applySearchRequest()
  else if (!users.value.length) fetchUsers()
})
watchEffect(() => { badges.users = userTotal.value })
</script>

<template>
  <div>
  <div v-if="actionError" class="fixed top-4 left-1/2 -translate-x-1/2 z-[130] px-4 py-2.5 rounded-xl bg-rose-500 text-white text-xs font-bold shadow-xl">
    {{ actionError }}
  </div>

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
            <button v-if="isAdminPlus" type="button" title="Редактировать профиль" @click="editingUser = user"
              class="flex items-center justify-center bg-white/[0.06] border border-transparent rounded-full w-7 h-7 text-white/70
                hover:bg-white/[0.08] hover:text-white cursor-pointer transition-all">
              <BIcon name="Pencil" class="w-3.5 h-3.5" />
            </button>
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

  <AdminEditUserModal v-if="editingUser" :user="editingUser" @saved="onUserProfileSaved" @close="editingUser = null" />
  </div>
</template>

<style scoped src="./admin-shared.css"></style>
