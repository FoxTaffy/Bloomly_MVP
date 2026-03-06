<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useFriendsStore } from '@/stores/friends'
import { useLangStore } from '@/stores/lang'
import BIcon from './BIcon.vue'

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

onMounted(() => { friendsStore.loadRequests().catch(() => {}) })

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
    'stickers':   'stickers',
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
  { key: 'stickers',    icon: 'Sticker',     label: langStore.t.stickers,  disabled: false, action: () => router.push({ name: 'stickers' }) },
  { key: 'dealers-den', icon: 'ShoppingBag', label: langStore.t.dealersDen, disabled: false, action: () => router.push({ name: 'dealers-den' }) },
  { key: 'gifts',       icon: 'Gift',        label: langStore.t.gifts,      disabled: true,  action: () => {} },
  { key: 'help',        icon: 'HelpCircle',  label: langStore.t.help,       disabled: true,  action: () => {} },
])
</script>

<template>
  <aside class="w-64 hidden lg:block sticky top-24 self-start space-y-6 flex-shrink-0">

    <!-- User profile block -->
    <div
      class="flex items-center gap-3 cursor-pointer group"
      @click="router.push(`/profile/${auth.user?.id}`)">
      <img
        v-if="auth.avatarUrl"
        :src="auth.avatarUrl"
        class="w-12 h-12 rounded-full object-cover border-2 border-brand-border group-hover:border-brand-accent transition-colors" />
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
      <!-- Dynamic nav items -->
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
        <!-- Lock icon for disabled items -->
        <BIcon v-if="item.disabled" name="Lock" class="w-3.5 h-3.5 opacity-60" />
        <!-- Badge for available items -->
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
