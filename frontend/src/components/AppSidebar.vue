<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useLangStore } from '@/stores/lang'
import { useGroupsStore } from '@/stores/groups'
import { useMessagesStore } from '@/stores/messages'
import { useMobileSidebar } from '@/composables/useMobileSidebar'
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

const ADMIN_ROUTES = new Set([
  'group-detail', 'group-settings',
  'my-applications', 'my-tickets', 'my-todolist',
])

// Show admin tools when on own group page or any related admin page
const adminGroup = computed(() => {
  if (!ADMIN_ROUTES.has(route.name as string) || !auth.user) return null

  let g = groupsStore.currentGroup

  if (!g && route.query.group) {
    const m = groupsStore.myGroups.find(m => m.group_id === route.query.group)
    g = m?.group ?? null
  }

  if (!g) return null

  const isOwner = g.owner_id === auth.user.id
  const isAdmin = groupsStore.myGroups.some(
    m => m.group_id === g!.id && ['owner', 'admin'].includes(m.role)
  )
  return (isOwner || isAdmin) ? g : null
})

// Per-type admin tool list (after the universal "Настройки группы" button)
const adminTools = computed(() => {
  const g = adminGroup.value
  if (!g) return []
  const gid = g.id
  const slug = (g as any).slug ?? g.id
  const t = g.type

  const go = (name: string, query?: Record<string, string>) =>
    () => router.push({ name, ...(query ? { query } : {}), ...(name === 'group-settings' ? { params: { slugOrId: slug } } : {}) })

  if (t === 'event') return [
    { key: 'applications', icon: 'ClipboardList',  label: 'Заявки участников', action: go('my-applications', { group: gid }) },
    { key: 'tickets',      icon: 'Ticket',          label: 'Билеты',           action: go('my-tickets',      { group: gid }) },
    { key: 'status',       icon: 'CalendarCheck',   label: 'Статус события',   action: go('group-settings') },
    { key: 'schedule',     icon: 'Clock',           label: 'Программа',        action: go('group-settings') },
  ]

  if (t === 'artist') return [
    { key: 'orders',  icon: 'Palette',       label: 'Мои заказы',  action: go('my-applications', { group: gid }) },
    { key: 'queue',   icon: 'List',          label: 'Очередь',     action: go('my-applications', { group: gid }) },
    { key: 'todo',    icon: 'CheckSquare',   label: 'Todolist',    action: go('my-todolist',     { group: gid }) },
    { key: 'price',   icon: 'Tag',           label: 'Прайс',       action: go('group-settings') },
  ]

  if (t === 'creative') return [
    { key: 'orders', icon: 'Scissors',     label: 'Заказы',  action: go('my-applications', { group: gid }) },
    { key: 'todo',   icon: 'CheckSquare',  label: 'Todolist', action: go('my-todolist',     { group: gid }) },
    { key: 'price',  icon: 'Tag',          label: 'Прайс',   action: go('group-settings') },
  ]

  if (t === 'news') return [
    { key: 'posts', icon: 'Newspaper', label: 'Публикации', action: go('group-detail', { slugOrId: slug } as any) },
    { key: 'team',  icon: 'Users',     label: 'Редакция',   action: go('group-settings') },
  ]

  if (t === 'shop') return [
    { key: 'goods',  icon: 'ShoppingBag', label: 'Товары',  action: go('group-settings') },
    { key: 'orders', icon: 'Package',     label: 'Заказы',  action: go('my-applications', { group: gid }) },
  ]

  // community / static / brand
  return [
    { key: 'members', icon: 'Users',         label: 'Участники', action: go('group-detail') },
    { key: 'posts',   icon: 'Megaphone',     label: 'Посты',     action: go('group-detail') },
  ]
})

function navigate(fn: () => void) {
  mobileSidebar.close()
  fn()
}

onMounted(() => {
  friendsStore.loadRequests().catch(() => {})
  messagesStore.fetchUnreadCount().catch(() => {})
  if (auth.user && !groupsStore.myGroups.length) {
    groupsStore.loadMyGroups().catch(() => {})
  }
})
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
    'automation': 'automation',
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
    action: () => { emit('update:activeNav', 'home'); router.push({ name: 'home' }) },
  },
  {
    key: 'explore',
    icon: 'Compass',
    label: langStore.t.explore,
    disabled: true,
    action: () => {},
  },
  {
    key: 'messages',
    icon: 'MessageCircle',
    label: langStore.t.messages,
    disabled: false,
    action: () => router.push({ name: 'messages' }),
    badge: messagesStore.unreadCount > 0 ? String(messagesStore.unreadCount) : undefined,
  },
  {
    key: 'friends',
    icon: 'Users',
    label: langStore.t.friends,
    disabled: false,
    action: () => router.push({ name: 'friends' }),
    badge: friendsStore.requestsCount > 0 ? String(friendsStore.requestsCount) : undefined,
  },
  {
    key: 'groups',
    icon: 'Grid',
    label: langStore.t.groups,
    disabled: false,
    action: () => router.push({ name: 'groups' }),
  },
  {
    key: 'bookmarks',
    icon: 'Bookmark',
    label: langStore.t.bookmarks,
    disabled: false,
    action: () => router.push({ name: 'bookmarks' }),
  },
  {
    key: 'subscriptions',
    icon: 'Sparkles',
    label: langStore.t.premium,
    disabled: false,
    action: () => router.push({ name: 'subscriptions' }),
    badge: (() => {
      const tier = (auth.user as any)?.subscription_tier ?? 'free'
      return tier !== 'free' ? tier.charAt(0).toUpperCase() + tier.slice(1) : undefined
    })(),
  },
])

const categoryItems = computed(() => [
  { key: 'shop',        icon: 'ShoppingBag', label: langStore.t.shop ?? 'Магазин', disabled: false, action: () => router.push({ name: 'shop' }) },
  { key: 'dealers-den', icon: 'Tag',         label: langStore.t.dealersDen,  disabled: false, action: () => router.push({ name: 'dealers-den' }) },
  { key: 'automation',  icon: 'Zap',         label: 'Автоматизация',         disabled: false, action: () => router.push({ name: 'automation' }) },
  { key: 'gifts',       icon: 'Gift',        label: langStore.t.gifts,       disabled: true,  action: () => {} },
  { key: 'help',        icon: 'HelpCircle',  label: langStore.t.help,        disabled: true,  action: () => {} },
])
</script>

<template>
  <!-- ── Mobile drawer backdrop ──────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="sidebar-fade">
      <div
        v-if="mobileSidebar.isOpen.value"
        class="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm lg:hidden"
        @click="mobileSidebar.close()"
      />
    </Transition>
    <Transition name="sidebar-slide">
      <div
        v-if="mobileSidebar.isOpen.value"
        class="fixed top-0 left-0 bottom-0 z-[301] w-72 bg-brand-bg border-r border-brand-border shadow-2xl lg:hidden flex flex-col overflow-y-auto"
      >
        <!-- Drawer header -->
        <div class="flex items-center justify-between px-4 py-4 border-b border-brand-border flex-shrink-0">
          <div class="flex items-center gap-2.5 cursor-pointer" @click="navigate(() => router.push({ name: 'home' }))">
            <img src="/bloomly.png?v=2" alt="Bloomly" class="w-7 h-7 object-contain" />
            <span class="text-lg font-extrabold text-white">Bloomly</span>
          </div>
          <button @click="mobileSidebar.close()" class="p-1.5 rounded-xl text-white/55 hover:text-white hover:bg-white/5 transition-all">
            <BIcon name="X" class="w-5 h-5" />
          </button>
        </div>

        <!-- Drawer content -->
        <div class="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          <!-- User profile -->
          <div
            class="flex items-center gap-3 cursor-pointer group px-1"
            @click="navigate(() => router.push(`/profile/${auth.user?.username}`))">
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
          </div>

          <!-- Main nav -->
          <nav class="space-y-0.5">
            <button v-for="item in navItems" :key="item.key"
              @click="!item.disabled && navigate(item.action)"
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
            </button>
            <button @click="navigate(() => router.push({ name: 'settings-profile' }))"
              class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
              :class="isActive('settings') ? 'bg-brand-card text-white' : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
              <BIcon name="Settings" class="w-5 h-5" />
              <span>{{ langStore.t.settings }}</span>
            </button>
          </nav>

          <!-- Categories -->
          <div>
            <h4 class="px-4 text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">{{ langStore.t.categories }}</h4>
            <nav class="space-y-0.5">
              <button v-for="cat in categoryItems" :key="cat.key"
                @click="!cat.disabled && navigate(cat.action)"
                class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
                :class="cat.disabled ? 'opacity-40 cursor-not-allowed text-white/35'
                  : isActive(cat.key) ? 'bg-brand-card text-white'
                  : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
                <BIcon :name="cat.icon" class="w-5 h-5" />
                <span class="flex-1 text-left">{{ cat.label }}</span>
                <BIcon v-if="cat.disabled" name="Lock" class="w-3.5 h-3.5 opacity-60" />
              </button>
            </nav>
          </div>

          <slot name="extra" />

          <!-- Admin tools mobile — shown only on own group page -->
          <div v-if="adminGroup">
            <h4 class="px-4 text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Админ-инструменты</h4>
            <nav class="space-y-0.5">
              <button
                @click="navigate(() => router.push({ name: 'group-settings', params: { slugOrId: (adminGroup as any).slug } }))"
                class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all text-white"
                style="background: linear-gradient(135deg, #6c47ff, #a855f7); box-shadow: 0 2px 10px #6c47ff30">
                <BIcon name="Settings" class="w-5 h-5" />
                <span class="flex-1 text-left">Настройки группы</span>
              </button>
              <button v-for="tool in adminTools" :key="tool.key"
                @click="navigate(tool.action)"
                class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-white/65 hover:bg-brand-card/50 hover:text-white">
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
  <aside class="w-64 hidden lg:block sticky top-24 self-start space-y-6 flex-shrink-0">

    <!-- User profile block -->
    <div
      class="flex items-center gap-3 cursor-pointer group"
      @click="router.push(`/profile/${auth.user?.username}`)">
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
    </div>

    <!-- Main navigation -->
    <nav class="space-y-1">
      <button
        v-for="item in navItems"
        :key="item.key"
        @click="!item.disabled && item.action()"
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
      </button>

      <!-- Settings link -->
      <button
        @click="router.push({ name: 'settings-profile' })"
        class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
        :class="isActive('settings')
          ? 'bg-brand-card text-white'
          : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
        <BIcon name="Settings" class="w-5 h-5" />
        <span>{{ langStore.t.settings }}</span>
      </button>
    </nav>

    <!-- Extra slot (e.g. "О профиле" section on profile page) -->
    <slot name="extra" />

    <!-- Admin tools — shown only on own group page, tools vary by group type -->
    <div v-if="adminGroup">
      <h4 class="px-4 text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">Админ-инструменты</h4>
      <nav class="space-y-1">
        <button
          @click="router.push({ name: 'group-settings', params: { slugOrId: (adminGroup as any).slug } })"
          class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all text-white"
          style="background: linear-gradient(135deg, #6c47ff, #a855f7); box-shadow: 0 2px 10px #6c47ff30">
          <BIcon name="Settings" class="w-5 h-5" />
          <span class="flex-1 text-left">Настройки группы</span>
        </button>
        <button v-for="tool in adminTools" :key="tool.key"
          @click="tool.action()"
          class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-white/65 hover:bg-brand-card/50 hover:text-white">
          <BIcon :name="tool.icon" class="w-5 h-5" />
          <span class="flex-1 text-left">{{ tool.label }}</span>
        </button>
      </nav>
    </div>

    <!-- Categories -->
    <div>
      <h4 class="px-4 text-xs font-bold text-white/40 mb-2 uppercase tracking-wider">{{ langStore.t.categories }}</h4>
      <nav class="space-y-1">
        <button
          v-for="cat in categoryItems"
          :key="cat.key"
          @click="!cat.disabled && cat.action()"
          class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
          :class="cat.disabled
            ? 'opacity-40 cursor-not-allowed text-white/35'
            : isActive(cat.key)
              ? 'bg-brand-card text-white'
              : 'text-white/65 hover:bg-brand-card/50 hover:text-white'">
          <BIcon :name="cat.icon" class="w-5 h-5" />
          <span class="flex-1 text-left">{{ cat.label }}</span>
          <BIcon v-if="cat.disabled" name="Lock" class="w-3.5 h-3.5 opacity-60" />
        </button>
      </nav>
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
