<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
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

// Active detection: prefer route name, fall back to activeNav prop
const isActive = (key: string): boolean => {
  const routeMap: Record<string, string> = {
    home:      'home',
    bookmarks: 'bookmarks',
    messages:  'messages',
    settings:  'settings-profile',
  }
  if (routeMap[key]) return route.name === routeMap[key]
  return props.activeNav === key
}

const navItems = [
  {
    key: 'home',
    icon: 'Home',
    label: 'Главная',
    disabled: false,
    action: () => { emit('update:activeNav', 'home'); router.push({ name: 'home' }) },
  },
  {
    key: 'explore',
    icon: 'Compass',
    label: 'Исследовать',
    disabled: true,
    action: () => {},
  },
  {
    key: 'messages',
    icon: 'MessageCircle',
    label: 'Сообщения',
    disabled: false,
    action: () => router.push({ name: 'messages' }),
  },
  {
    key: 'friends',
    icon: 'Users',
    label: 'Друзья',
    disabled: true,
    action: () => {},
  },
  {
    key: 'groups',
    icon: 'Grid',
    label: 'Группы',
    disabled: true,
    action: () => {},
  },
  {
    key: 'bookmarks',
    icon: 'Bookmark',
    label: 'Закладки',
    disabled: false,
    action: () => router.push({ name: 'bookmarks' }),
  },
]

const categoryItems = [
  { icon: 'Sticker',     label: 'Стикеры' },
  { icon: 'Gift',        label: 'Подарки' },
  { icon: 'ShoppingBag', label: "Dealers' Den" },
  { icon: 'HelpCircle',  label: 'Помощь' },
]
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
        <p class="text-xs text-brand-muted">Перейти в профиль</p>
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
          ? 'opacity-40 cursor-not-allowed text-brand-muted'
          : isActive(item.key)
            ? 'bg-brand-card text-white'
            : 'text-brand-muted hover:bg-brand-card/50 hover:text-white'">
        <BIcon :name="item.icon" class="w-5 h-5" />
        <span class="flex-1 text-left">{{ item.label }}</span>
        <!-- Lock icon for disabled items -->
        <BIcon v-if="item.disabled" name="Lock" class="w-3.5 h-3.5 opacity-60" />
        <!-- Badge for available items -->
        <span
          v-else-if="item.badge"
          class="text-[10px] font-bold bg-brand-bg px-2 py-0.5 rounded-full text-white">
          {{ item.badge }}
        </span>
      </button>

      <!-- Settings link -->
      <button
        @click="router.push({ name: 'settings-profile' })"
        class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all"
        :class="isActive('settings')
          ? 'bg-brand-card text-white'
          : 'text-brand-muted hover:bg-brand-card/50 hover:text-white'">
        <BIcon name="Settings" class="w-5 h-5" />
        <span>Настройки</span>
      </button>
    </nav>

    <!-- Extra slot (e.g. "О профиле" section on profile page) -->
    <slot name="extra" />

    <!-- Categories (coming soon — locked) -->
    <div>
      <h4 class="px-4 text-xs font-bold text-brand-muted mb-2 uppercase tracking-wider">Категории</h4>
      <nav class="space-y-1">
        <button
          v-for="cat in categoryItems"
          :key="cat.label"
          disabled
          class="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all text-brand-muted opacity-40 cursor-not-allowed">
          <BIcon :name="cat.icon" class="w-5 h-5" />
          <span class="flex-1 text-left">{{ cat.label }}</span>
          <BIcon name="Lock" class="w-3.5 h-3.5 opacity-60" />
        </button>
      </nav>
    </div>

    <!-- Bottom slot (e.g. ad banners) -->
    <slot name="bottom" />
  </aside>
</template>
