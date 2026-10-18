<script setup lang="ts">
import { onMounted, computed, ref, type Component } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import { useAuthStore } from '../stores/auth'
import BIcon from '../components/BIcon.vue'
import { createAdminContext, provideAdminContext, type AdminTab } from '@/components/admin/adminContext'
import { ROLE_RANK, roleLabel, roleColor, formatNum } from '@/components/admin/adminHelpers'
import { isModerator } from '@/lib/roles'
import AdminOverviewTab from '@/components/admin/AdminOverviewTab.vue'
import AdminUsersTab from '@/components/admin/AdminUsersTab.vue'
import AdminPostsTab from '@/components/admin/AdminPostsTab.vue'
import AdminTagsTab from '@/components/admin/AdminTagsTab.vue'
import AdminReportsTab from '@/components/admin/AdminReportsTab.vue'
import AdminSupportTab from '@/components/admin/AdminSupportTab.vue'
import AdminAdsTab from '@/components/admin/AdminAdsTab.vue'
import AdminVerificationTab from '@/components/admin/AdminVerificationTab.vue'
import AdminAutoModTab from '@/components/admin/AdminAutoModTab.vue'
import AdminUpdatesTab from '@/components/admin/AdminUpdatesTab.vue'
import AdminGroupsTab from '@/components/admin/AdminGroupsTab.vue'
import AdminFinanceTab from '@/components/admin/AdminFinanceTab.vue'
import AdminSettingsTab from '@/components/admin/AdminSettingsTab.vue'
import AdminNavList from '@/components/admin/AdminNavList.vue'

const langStore = useLangStore()
const router = useRouter()
const auth = useAuthStore()

const ctx = createAdminContext()
provideAdminContext(ctx)
const { myRole, myRoleRank, activeTab, switchTab, badges, adminActionError, stats, fetchStats, fetchStatistics, userSearchRequest } = ctx

// Телефон: меню не помещается в строку, поэтому выезжает панелью поверх страницы
const mobileNavOpen = ref(false)
const pickTab = (tab: AdminTab) => {
  switchTab(tab)
  mobileNavOpen.value = false
}

// Guard: staff only (moderator and above)
onMounted(async () => {
  await auth.fetchMe()
  const role = auth.user?.role
  if (!isModerator(role)) {
    router.replace({ name: 'home' })
  } else {
    fetchStats()
    fetchStatistics()
  }
})

// Each tab owns its data and loads it the first time it is opened;
// <KeepAlive> keeps that state when switching between tabs.
const TAB_COMPONENTS: Record<AdminTab, Component> = {
  overview: AdminOverviewTab,
  users: AdminUsersTab,
  posts: AdminPostsTab,
  tags: AdminTagsTab,
  reports: AdminReportsTab,
  support: AdminSupportTab,
  ads: AdminAdsTab,
  verification: AdminVerificationTab,
  automod: AdminAutoModTab,
  updates: AdminUpdatesTab,
  groups: AdminGroupsTab,
  finance: AdminFinanceTab,
  settings: AdminSettingsTab,
}

const navItems = computed(() => [
  { tab: 'overview'     as const, label: langStore.t.adminNavOverview,        icon: 'LayoutDashboard', color: '#4C67CF', group: null,                      badge: null, minRole: 'moderator' },
  { tab: 'users'        as const, label: langStore.t.adminNavUsers,          icon: 'Users',           color: '#94a3b8', group: langStore.t.adminGroupModeration, badge: badges.users > 0 ? formatNum(badges.users) : null, minRole: 'moderator' },
  { tab: 'reports'      as const, label: langStore.t.adminNavReports,        icon: 'Flag',            color: '#f59e0b', group: langStore.t.adminGroupModeration, badge: badges.reports || null, minRole: 'moderator' },
  { tab: 'support'      as const, label: langStore.t.adminNavSupport,        icon: 'LifeBuoy',        color: '#4C67CF', group: langStore.t.adminGroupModeration, badge: badges.support || null, minRole: 'moderator' },
  { tab: 'automod'      as const, label: 'AutoMod',                          icon: 'ShieldAlert',     color: '#ef4444', group: langStore.t.adminGroupModeration, badge: badges.automod > 0 ? formatNum(badges.automod) : null, minRole: 'moderator' },
  { tab: 'posts'        as const, label: langStore.t.posts,                 icon: 'FileText',        color: '#94a3b8', group: langStore.t.adminGroupContent,    badge: null, minRole: 'moderator' },
  { tab: 'tags'         as const, label: 'Синонимы тегов',                    icon: 'Hash',            color: '#94a3b8', group: langStore.t.adminGroupContent,    badge: null, minRole: 'moderator' },
  { tab: 'verification' as const, label: langStore.t.secVerification,        icon: 'BadgeCheck',      color: '#2dd4bf', group: langStore.t.adminGroupContent,    badge: badges.verification || null, minRole: 'moderator' },
  { tab: 'ads'          as const, label: langStore.t.adLabel,                icon: 'Megaphone',       color: '#f97316', group: langStore.t.adminGroupContent,    badge: badges.ads || null, minRole: 'admin' },
  { tab: 'updates'      as const, label: langStore.t.adminNavBroadcasts,     icon: 'Send',            color: '#4C67CF', group: langStore.t.adminGroupContent,    badge: null, minRole: 'admin' },
  { tab: 'groups'       as const, label: langStore.t.adminNavGroupsEvents,   icon: 'LayoutGrid',      color: '#4C67CF', group: langStore.t.adminGroupPlatform,   badge: null, minRole: 'moderator' },
  { tab: 'finance'      as const, label: langStore.t.adminNavFinancePremium, icon: 'Wallet',          color: '#a78bfa', group: langStore.t.adminGroupPlatform,   badge: null, minRole: 'admin' },
  { tab: 'settings'     as const, label: langStore.t.adminNavLogsSettings,   icon: 'Settings',        color: '#94a3b8', group: langStore.t.adminGroupPlatform,   badge: null, minRole: 'admin' },
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
  updates: langStore.t.adminTabSubBroadcasts,
  groups: langStore.t.adminTabSubGroups,
  finance: langStore.t.adminTabSubFinance,
  settings: langStore.t.adminTabSubSettings,
}))

// ── Header search — jumps into Users with the query pre-filled ─────────
const headerSearch = ref('')
const runHeaderSearch = () => {
  const q = headerSearch.value.trim()
  if (!q) return
  userSearchRequest.value = q
  switchTab('users')
}

// ── Bell badge — total items actually waiting on staff review ──────────
const totalPendingBadge = computed(() => {
  if (!stats.value) return 0
  return stats.value.moderation.pendingReports
    + stats.value.moderation.pendingVerification
    + stats.value.moderation.pendingAds
    + badges.support
})
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito flex relative isolate">

    <!-- ═══════════════════ SIDEBAR ═══════════════════════════════════════ -->
    <aside class="w-64 shrink-0 hidden md:flex flex-col fixed top-0 left-0 h-full z-30
      bg-brand-card border-r border-brand-border">

      <!-- Logo -->
      <div class="px-5 pt-6 pb-5 border-b border-brand-border">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 flex items-center justify-center shrink-0">
            <img src="/bloomly.png?v=2" alt="Bloomly" class="w-full h-full object-contain" />
          </div>
          <p class="font-extrabold text-white text-xl tracking-tight leading-none">Bloomly</p>
          <span class="text-[10px] font-extrabold px-2 py-1 rounded-full bg-brand-accent/15 text-brand-accent border border-brand-accent/25 tracking-widest">ADMIN</span>
        </div>
      </div>

      <!-- Nav items -->
      <nav class="flex-1 px-3 py-4 overflow-y-auto adm-scroll">
        <AdminNavList :groups="navGroups" :active-tab="activeTab" @select="switchTab" />
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
      <header class="adm-header sticky top-0 z-20 bg-brand-bg/95 backdrop-blur-xl border-b border-brand-border px-4 md:px-6 py-3 md:py-3.5 flex items-center gap-2 md:gap-4">
        <!-- Menu button: телефон -->
        <button @click="mobileNavOpen = true" :aria-label="langStore.t.adminMenuOpen"
          class="md:hidden w-10 h-10 rounded-xl bg-brand-bg border border-brand-border flex items-center justify-center text-white/60 hover:text-white transition-all shrink-0">
          <BIcon name="Menu" class="w-5 h-5" />
        </button>

        <!-- Search -->
        <div class="relative flex-1 min-w-0 max-w-xl">
          <BIcon name="Search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input v-model="headerSearch" @keyup.enter="runHeaderSearch" type="search" enterkeyhint="search"
            :placeholder="langStore.t.adminSearchPlaceholderGlobal"
            class="w-full bg-brand-bg border border-brand-border rounded-2xl pl-11 pr-4 py-2.5 text-base md:text-sm text-white placeholder-white/25
              outline-hidden focus:border-brand-accent/50 transition-all" />
        </div>

        <!-- Bell -->
        <button :title="langStore.t.adminBellPendingReview" class="relative flex w-10 h-10 md:w-9 md:h-9 rounded-xl bg-brand-bg border border-brand-border items-center justify-center text-white/50 hover:text-white transition-all shrink-0">
          <BIcon name="Bell" class="w-4 h-4" />
          <span v-if="totalPendingBadge > 0" class="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand-error text-white text-[9px] font-extrabold flex items-center justify-center">
            {{ totalPendingBadge > 99 ? '99+' : totalPendingBadge }}
          </span>
        </button>

        <!-- My identity -->
        <div class="hidden lg:flex items-center gap-2.5 pl-3 border-l border-brand-border shrink-0">
          <img v-if="auth.user?.avatar_url" :src="auth.user.avatar_url" class="w-9 h-9 rounded-xl object-cover border border-brand-border shrink-0" />
          <div v-else class="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0"
            :style="`background:${roleColor(myRole)}20;color:${roleColor(myRole)}`">
            {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
          </div>
          <div class="min-w-0">
            <p class="text-xs font-bold text-white truncate">{{ auth.user?.display_name || auth.user?.username }}</p>
            <p class="text-[10px] font-bold" :style="`color:${roleColor(myRole)}`">{{ roleLabel(myRole) }}</p>
          </div>
        </div>
      </header>

      <!-- Page content -->
      <main class="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full min-w-0">
        <div v-if="adminActionError" role="alert"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-500/15 border border-rose-500/30 text-rose-300 shadow-lg shadow-black/40">
          {{ adminActionError }}
        </div>
      <div class="mb-5 md:mb-6">
        <h1 class="text-xl md:text-2xl font-black text-white">{{ tabTitle[activeTab] ?? navItems.find(i=>i.tab===activeTab)?.label }}</h1>
        <p class="text-sm text-white/40 mt-0.5">{{ tabSubtitle[activeTab] }}</p>
      </div>
      <Transition name="tab-fade" mode="out-in">
        <KeepAlive>
          <component :is="TAB_COMPONENTS[activeTab]" />
        </KeepAlive>
      </Transition>
      </main>
    </div>

    <!-- ═══════════════════ MOBILE MENU (drawer) ══════════════════════════ -->
    <Transition name="drawer-fade">
      <div v-if="mobileNavOpen" class="md:hidden fixed inset-0 z-40 bg-black/60" @click="mobileNavOpen = false" />
    </Transition>
    <Transition name="drawer-slide">
      <aside v-if="mobileNavOpen" class="md:hidden fixed top-0 left-0 h-full w-72 max-w-[85vw] z-50 flex flex-col bg-brand-card border-r border-brand-border shadow-2xl shadow-black/50">
        <div class="px-4 pt-5 pb-4 border-b border-brand-border flex items-center gap-2.5">
          <img src="/bloomly.png?v=2" alt="Bloomly" class="w-8 h-8 object-contain" />
          <p class="font-extrabold text-white text-lg tracking-tight leading-none">Bloomly</p>
          <span class="text-[10px] font-extrabold px-2 py-1 rounded-full bg-brand-accent/15 text-brand-accent border border-brand-accent/25 tracking-widest">ADMIN</span>
          <button @click="mobileNavOpen = false" :aria-label="langStore.t.adminMenuClose"
            class="ml-auto w-9 h-9 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/5">
            <BIcon name="X" class="w-5 h-5" />
          </button>
        </div>
        <nav class="flex-1 px-3 py-4 overflow-y-auto adm-scroll">
          <AdminNavList :groups="navGroups" :active-tab="activeTab" @select="pickTab" />
        </nav>
        <div class="p-3 border-t border-brand-border">
          <button @click="router.push({ name: 'home' })"
            class="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-2xl text-xs font-semibold text-white/40 hover:text-white/70 hover:bg-white/5 transition-all">
            <BIcon name="ArrowLeft" class="w-3.5 h-3.5" /> {{ langStore.t.goHome }}
          </button>
        </div>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.tab-fade-enter-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.tab-fade-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.tab-fade-enter-from { opacity: 0; transform: translateY(6px); }
.tab-fade-leave-to { opacity: 0; transform: translateY(-4px); }

.drawer-fade-enter-active, .drawer-fade-leave-active { transition: opacity 0.2s ease; }
.drawer-fade-enter-from, .drawer-fade-leave-to { opacity: 0; }
.drawer-slide-enter-active, .drawer-slide-leave-active { transition: transform 0.25s ease; }
.drawer-slide-enter-from, .drawer-slide-leave-to { transform: translateX(-100%); }

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
