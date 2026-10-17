<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useLangStore } from '@/stores/lang'
import { useGroupsStore } from '@/stores/groups'
import { useMessagesStore } from '@/stores/messages'
import { useMobileSidebar } from '@/composables/useMobileSidebar'
import { useGroupAdminTools } from '@/composables/useGroupAdminTools'
import BIcon from './BIcon.vue'
import { onAvatarError } from '@/composables/useAvatarFallback'

// kept for backward compat (MainLayout still passes it for home sub-views)
const props = withDefaults(defineProps<{
  activeNav?: string
}>(), { activeNav: '' })

const emit = defineEmits<{
  'update:activeNav': [val: string]
}>()

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()
const friendsStore = useFriendsStore()
const langStore = useLangStore()
const groupsStore = useGroupsStore()
const messagesStore = useMessagesStore()
const mobileSidebar = useMobileSidebar()

// Show admin tools when on own group page or any related admin page — tool set
// and "already on this group's tools page" sync logic live in the composable so
// GroupAdminToolsView and this sidebar never drift apart.
const { adminGroup, adminTools, isToolActive } = useGroupAdminTools()

function navigate(fn: () => void) {
  mobileSidebar.close()
  fn()
}

watch([() => auth.user?.id, () => auth.isAuthenticated], ([userId, authenticated]) => {
  if (!userId || !authenticated) return;
  friendsStore.loadRequests().catch(() => {})
  messagesStore.fetchUnreadCount().catch(() => {})
  if (auth.user) messagesStore.fetchMyGroupInboxCounts()
  if (auth.user && !groupsStore.myGroups.length) {
    groupsStore.loadMyGroups().catch(() => {})
  }
}, { immediate: true })

// Sum of pending "Обращения" across every group the user owns/admins/moderates.
const groupInboxTotal = computed(() =>
  Object.values(messagesStore.groupInboxCounts).reduce((sum, n) => sum + n, 0))
watch(() => route.name, () => { mobileSidebar.close() })

// Active detection: prefer route name, fall back to activeNav prop
const isActive = (key: string): boolean => {
  const routeMap: Record<string, string> = {
    home:         'home',
    bookmarks:    'bookmarks',
    messages:     'messages',
    friends:      'friends',
    settings:     'settings-profile',
    groups:       'groups',
    subscriptions:'subscriptions',
    'dealers-den':'dealers-den',
    'shop':         'shop',
    explore:      'explore',
    'scheduled-posts': 'scheduled-posts',
  }
  if (routeMap[key]) return route.name === routeMap[key]
  return props.activeNav === key
}

const navItems = computed(() => [
  {
    key: 'home',
    icon: 'Home',
    label: langStore.t.home,
    disabled: false,
    to: { name: 'home' },
    onClick: () => emit('update:activeNav', 'home'),
  },
  {
    key: 'explore',
    icon: 'Compass',
    label: langStore.t.explore,
    disabled: false,
    to: { name: 'explore' },
  },
  {
    key: 'messages',
    icon: 'MessageCircle',
    label: langStore.t.messages,
    disabled: false,
    to: { name: 'messages' },
    badge: messagesStore.unreadCount > 0 ? String(messagesStore.unreadCount) : undefined,
  },
  {
    key: 'friends',
    icon: 'Users',
    label: langStore.t.friends,
    disabled: false,
    to: { name: 'friends' },
    badge: friendsStore.requestsCount > 0 ? String(friendsStore.requestsCount) : undefined,
  },
  {
    key: 'groups',
    icon: 'Grid',
    label: langStore.t.groups,
    disabled: false,
    to: { name: 'groups' },
    // "Обращения" pending across every group the user administers — not the unrelated
    // real multi-participant group-chat unread count (that lives under "Сообщения").
    badge: groupInboxTotal.value > 0 ? String(groupInboxTotal.value) : undefined,
  },
  {
    key: 'bookmarks',
    icon: 'Bookmark',
    label: langStore.t.bookmarks,
    disabled: false,
    to: { name: 'bookmarks' },
  },
  {
    key: 'subscriptions',
    icon: 'Sparkles',
    label: langStore.t.premium,
    disabled: false,
    to: { name: 'subscriptions' },
    badge: (() => {
      const tier = auth.user?.subscription_tier ?? 'free'
      return tier !== 'free' ? tier.charAt(0).toUpperCase() + tier.slice(1) : undefined
    })(),
  },
])

const categoryItems = computed(() => [
  { key: 'shop',        icon: 'ShoppingBag', label: langStore.t.shop ?? 'Магазин', disabled: false, to: { name: 'shop' } },
  { key: 'dealers-den', icon: 'Tag',         label: langStore.t.dealersDen,  disabled: false, to: { name: 'dealers-den' } },
  { key: 'scheduled-posts', icon: 'CalendarClock', label: 'Черновики и отложенные', disabled: false, to: { name: 'scheduled-posts' } },
  { key: 'gifts',       icon: 'Gift',        label: langStore.t.gifts,       disabled: true,  to: null as any },
  { key: 'help',        icon: 'CircleHelp',  label: langStore.t.help,        disabled: false, to: { name: 'help' } },
])
</script>

<template>
  <!-- ── Mobile drawer backdrop ──────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="sidebar-fade">
      <div
        v-if="mobileSidebar.isOpen.value"
        class="fixed inset-0 z-300 bg-black/60 backdrop-blur-xs lg:hidden"
        @click="mobileSidebar.close()"
      />
    </Transition>
    <Transition name="sidebar-slide">
      <div
        v-if="mobileSidebar.isOpen.value"
        class="fixed top-0 left-0 bottom-0 z-301 w-72 bg-brand-bg border-r border-brand-border shadow-2xl lg:hidden flex flex-col overflow-y-auto"
      >
        <!-- Drawer header -->
        <div class="flex items-center justify-between px-4 py-4 border-b border-brand-border shrink-0">
          <router-link :to="{ name: 'home' }" class="flex items-center gap-2.5 cursor-pointer" @click="mobileSidebar.close()">
            <img src="/bloomly.png?v=2" alt="Bloomly" class="w-7 h-7 object-contain" />
            <span class="text-lg font-extrabold text-white">Bloomly</span>
          </router-link>
          <button @click="mobileSidebar.close()" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-white/5 transition-all">
            <BIcon name="X" class="w-5 h-5" />
          </button>
        </div>

        <!-- Drawer content -->
        <div class="flex-1 px-3 py-4 stack-y-6 overflow-y-auto">
          <!-- User profile -->
          <router-link v-if="auth.user"
            :to="`/profile/${auth.user?.username}`"
            class="flex items-center gap-3 cursor-pointer group px-1"
            @click="mobileSidebar.close()">
            <img v-if="auth.avatarUrl" :src="auth.avatarUrl"
              class="w-10 h-10 rounded-full object-cover border-2 border-brand-border group-hover:border-brand-accent transition-colors"
              @error="onAvatarError" />
            <div v-else
              class="w-10 h-10 rounded-full border-2 border-brand-border bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold transition-colors">
              {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
            </div>
            <div>
              <h3 class="font-bold text-white text-sm group-hover:text-brand-accent transition-colors">{{ auth.displayName }}</h3>
              <p class="text-xs text-white/50">{{ langStore.t.goToProfile }}</p>
            </div>
          </router-link>
          <!-- Auth still (re)loading — skeleton instead of a flash of "User" -->
          <div v-else class="flex items-center gap-3 px-1 animate-pulse">
            <div class="w-10 h-10 rounded-full bg-white/10"></div>
            <div class="stack-y-1.5">
              <div class="h-3.5 w-24 rounded-sm bg-white/10"></div>
              <div class="h-2.5 w-16 rounded-sm bg-white/5"></div>
            </div>
          </div>

          <!-- Main nav -->
          <nav class="stack-y-0.5">
            <router-link v-for="item in navItems" :key="item.key"
              :to="item.to"
              @click="item.onClick?.(); mobileSidebar.close()"
              class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
              :class="item.disabled ? 'opacity-40 cursor-not-allowed text-white/35'
                : isActive(item.key) ? 'bg-brand-card text-white'
                : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
              <BIcon :name="item.icon" class="w-5 h-5" />
              <span class="flex-1 text-left">{{ item.label }}</span>
              <BIcon v-if="item.disabled" name="Lock" class="w-3.5 h-3.5 opacity-60" />
              <span v-else-if="item.badge" class="text-[10px] font-bold px-2 py-0.5 rounded-full"
                :class="item.key === 'subscriptions' ? 'bg-brand-accent/20 text-brand-accent border border-brand-accent/30' : 'bg-brand-bg text-white'">
                {{ item.badge }}
              </span>
            </router-link>
            <router-link :to="{ name: 'settings-profile' }" @click="mobileSidebar.close()"
              class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
              :class="isActive('settings') ? 'bg-brand-card text-white' : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
              <BIcon name="Settings" class="w-5 h-5" />
              <span>{{ langStore.t.settings }}</span>
            </router-link>
          </nav>

          <!-- Categories -->
          <div>
            <h4 class="px-4 text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">{{ langStore.t.categories }}</h4>
            <nav class="stack-y-0.5">
              <component :is="cat.disabled ? 'button' : 'router-link'" v-for="cat in categoryItems" :key="cat.key"
                :to="cat.disabled ? undefined : cat.to"
                @click="!cat.disabled && mobileSidebar.close()"
                class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
                :class="cat.disabled ? 'opacity-40 cursor-not-allowed text-white/35'
                  : isActive(cat.key) ? 'bg-brand-card text-white'
                  : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
                <BIcon :name="cat.icon" class="w-5 h-5" />
                <span class="flex-1 text-left">{{ cat.label }}</span>
                <BIcon v-if="cat.disabled" name="Lock" class="w-3.5 h-3.5 opacity-60" />
              </component>
            </nav>
          <div class="px-4 mt-1 flex flex-col gap-1.5 text-[11px] leading-tight text-white/35">
            <router-link :to="{ name: 'support' }" class="hover:text-white/70 transition-colors" @click="mobileSidebar.close()">{{ langStore.t.supportProject }}</router-link>
            <router-link :to="{ name: 'terms' }" class="hover:text-white/70 transition-colors" @click="mobileSidebar.close()">{{ langStore.t.legalTerms }}</router-link>
            <router-link :to="{ name: 'privacy' }" class="hover:text-white/70 transition-colors" @click="mobileSidebar.close()">{{ langStore.t.legalPrivacy }}</router-link>
          </div>
          </div>

          <slot name="extra" />

          <!-- Admin tools mobile — shown only on own group page -->
          <div v-if="adminGroup">
            <h4 class="px-4 text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Админ-инструменты</h4>
            <nav class="stack-y-0.5">
              <button
                @click="navigate(() => router.push({ name: 'group-settings', params: { slugOrId: (adminGroup as any).slug } }))"
                class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all text-white"
                style="background: linear-gradient(135deg, #6c47ff, #a855f7); box-shadow: 0 2px 10px #6c47ff30">
                <BIcon name="Settings" class="w-5 h-5" />
                <span class="flex-1 text-left">Настройки группы</span>
              </button>
              <button
                @click="navigate(() => router.push({ name: 'group-admin-tools', params: { slugOrId: (adminGroup as any).slug } }))"
                class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-white/65 hover:bg-brand-card/50 hover:text-white">
                <BIcon name="LayoutDashboard" class="w-5 h-5" />
                <span class="flex-1 text-left">Все инструменты</span>
              </button>
              <button v-for="tool in adminTools" :key="tool.key"
                @click="navigate(tool.action)"
                :class="[
                  'w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all',
                  isToolActive(tool) ? 'bg-brand-card text-white' : 'text-white/65 hover:bg-brand-card/50 hover:text-white'
                ]">
                <BIcon :name="tool.icon" class="w-5 h-5" />
                <span class="flex-1 text-left">{{ tool.label }}</span>
              </button>
            </nav>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Desktop sidebar ────────────────────────────────────────── -->
  <aside class="w-64 hidden lg:block sticky top-24 self-start stack-y-6 shrink-0">

    <!-- User profile block -->
    <router-link
      v-if="auth.user"
      :to="`/profile/${auth.user?.username}`"
      class="flex items-center gap-3 cursor-pointer group">
      <img
        v-if="auth.avatarUrl"
        :src="auth.avatarUrl"
        class="w-12 h-12 rounded-full object-cover border-2 border-brand-border group-hover:border-brand-accent transition-colors"
        @error="onAvatarError" />
      <div
        v-else
        class="w-12 h-12 rounded-full border-2 border-brand-border group-hover:border-brand-accent bg-brand-accent/20 flex items-center justify-center text-brand-accent font-bold text-lg transition-colors">
        {{ (auth.user?.display_name || auth.user?.username || '?')[0].toUpperCase() }}
      </div>
      <div>
        <h3 class="font-bold text-white text-sm group-hover:text-brand-accent transition-colors">{{ auth.displayName }}</h3>
        <p class="text-xs text-white/50">{{ langStore.t.goToProfile }}</p>
      </div>
    </router-link>
    <!-- Auth still (re)loading — skeleton instead of a flash of "User" -->
    <div v-else class="flex items-center gap-3 animate-pulse">
      <div class="w-12 h-12 rounded-full bg-white/10"></div>
      <div class="stack-y-1.5">
        <div class="h-3.5 w-28 rounded-sm bg-white/10"></div>
        <div class="h-2.5 w-20 rounded-sm bg-white/5"></div>
      </div>
    </div>

    <!-- Main navigation -->
    <nav class="stack-y-1">
      <router-link
        v-for="item in navItems"
        :key="item.key"
        :to="item.to"
        @click="item.onClick?.()"
        class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
        :class="item.disabled
          ? 'opacity-40 cursor-not-allowed text-white/35'
          : isActive(item.key)
            ? 'bg-brand-card text-white'
            : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
        <BIcon :name="item.icon" class="w-5 h-5" />
        <span class="flex-1 text-left">{{ item.label }}</span>
        <BIcon v-if="item.disabled" name="Lock" class="w-3.5 h-3.5 opacity-60" />
        <span
          v-else-if="item.badge"
          class="text-[10px] font-bold px-2 py-0.5 rounded-full"
          :class="item.key === 'subscriptions'
            ? 'bg-brand-accent/20 text-brand-accent border border-brand-accent/30'
            : 'bg-brand-bg text-white'">
          {{ item.badge }}
        </span>
      </router-link>

      <!-- Settings link -->
      <router-link
        :to="{ name: 'settings-profile' }"
        class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
        :class="isActive('settings')
          ? 'bg-brand-card text-white'
          : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
        <BIcon name="Settings" class="w-5 h-5" />
        <span>{{ langStore.t.settings }}</span>
      </router-link>
    </nav>

    <!-- Extra slot (e.g. "О профиле" section on profile page) -->
    <slot name="extra" />

    <!-- Admin tools — shown only on own group page, tools vary by group type -->
    <div v-if="adminGroup">
      <h4 class="px-4 text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Админ-инструменты</h4>
      <nav class="stack-y-1">
        <button
          @click="router.push({ name: 'group-settings', params: { slugOrId: adminGroup.slug } })"
          class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all text-white"
          style="background: linear-gradient(135deg, #6c47ff, #a855f7); box-shadow: 0 2px 10px #6c47ff30">
          <BIcon name="Settings" class="w-5 h-5" />
          <span class="flex-1 text-left">Настройки группы</span>
        </button>
        <button
          @click="router.push({ name: 'group-admin-tools', params: { slugOrId: adminGroup.slug } })"
          class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-white/65 hover:bg-brand-card/50 hover:text-white">
          <BIcon name="LayoutDashboard" class="w-5 h-5" />
          <span class="flex-1 text-left">Все инструменты</span>
        </button>
        <button v-for="tool in adminTools" :key="tool.key"
          @click="tool.action()"
          :class="[
            'w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all',
            isToolActive(tool) ? 'bg-brand-card text-white' : 'text-white/65 hover:bg-brand-card/50 hover:text-white'
          ]">
          <BIcon :name="tool.icon" class="w-5 h-5" />
          <span class="flex-1 text-left">{{ tool.label }}</span>
        </button>
      </nav>
    </div>

    <!-- Categories -->
    <div>
      <h4 class="px-4 text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">{{ langStore.t.categories }}</h4>
      <nav class="stack-y-1">
        <component
          :is="cat.disabled ? 'button' : 'router-link'"
          v-for="cat in categoryItems"
          :key="cat.key"
          :to="cat.disabled ? undefined : cat.to"
          class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
          :class="cat.disabled
            ? 'opacity-40 cursor-not-allowed text-white/35'
            : isActive(cat.key)
              ? 'bg-brand-card text-white'
              : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
          <BIcon :name="cat.icon" class="w-5 h-5" />
          <span class="flex-1 text-left">{{ cat.label }}</span>
          <BIcon v-if="cat.disabled" name="Lock" class="w-3.5 h-3.5 opacity-60" />
        </component>
      </nav>
    </div>

    <!-- Footer links: support / legal -->
    <div class="px-4 -mt-3 flex flex-col gap-1 text-[11px] leading-tight text-white/35">
      <router-link :to="{ name: 'support' }" class="hover:text-white/70 transition-colors">{{ langStore.t.supportProject }}</router-link>
      <router-link :to="{ name: 'terms' }" class="hover:text-white/70 transition-colors">{{ langStore.t.legalTerms }}</router-link>
      <router-link :to="{ name: 'privacy' }" class="hover:text-white/70 transition-colors">{{ langStore.t.legalPrivacy }}</router-link>
    </div>

    <!-- Bottom slot (e.g. ad banners) -->
    <slot name="bottom" />
  </aside>
</template>

<style scoped>
.sidebar-fade-enter-active, .sidebar-fade-leave-active { transition: opacity 0.25s ease; }
.sidebar-fade-enter-from, .sidebar-fade-leave-to { opacity: 0; }

.sidebar-slide-enter-active, .sidebar-slide-leave-active { transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1); }
.sidebar-slide-enter-from, .sidebar-slide-leave-to { transform: translateX(-100%); }
</style>
