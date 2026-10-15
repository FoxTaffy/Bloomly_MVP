<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import ApplicationsPanel from '@/components/groups/panels/ApplicationsPanel.vue'
import TicketsPanel from '@/components/groups/panels/TicketsPanel.vue'
import TodolistPanel from '@/components/groups/panels/TodolistPanel.vue'
import OrdersPanel from '@/components/groups/panels/OrdersPanel.vue'
import OverviewPanel from '@/components/groups/panels/OverviewPanel.vue'
import BalancePanel from '@/components/groups/panels/BalancePanel.vue'
import InboxPanel from '@/components/groups/panels/InboxPanel.vue'
import ScheduledPanel from '@/components/groups/panels/ScheduledPanel.vue'
import { useGroupsStore } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { useNsfwMode } from '@/composables/useNsfwMode'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()
const nsfwMode = useNsfwMode().nsfwEnabled

const loading = ref(true)

const group = computed(() => groupsStore.currentGroup)
const isOwner = computed(() => group.value?.owner_id === authStore.user?.id)
const isAdmin = computed(() => {
  if (isOwner.value) return true
  return groupsStore.myGroups.some(m => m.group_id === group.value?.id && ['admin', 'owner'].includes(m.role))
})

interface ToolTab {
  key: string
  label: string
  icon: string
  kind: 'overview' | 'applications' | 'tickets' | 'todolist' | 'orders' | 'balance' | 'inbox' | 'scheduled' | 'settings'
  settingsSection?: string
  settingsDesc?: string
}

const OVERVIEW_TAB: ToolTab = { key: 'overview', label: 'Обзор', icon: 'BarChart3', kind: 'overview' }
const BALANCE_TAB: ToolTab = { key: 'balance', label: 'Баланс', icon: 'Wallet', kind: 'balance' }
const INBOX_TAB: ToolTab = { key: 'inbox', label: 'Обращения', icon: 'Inbox', kind: 'inbox' }
const SCHEDULED_TAB: ToolTab = { key: 'scheduled', label: 'Отложенные', icon: 'CalendarClock', kind: 'scheduled' }

const toolTabs = computed<ToolTab[]>(() => {
  const t: string | undefined = group.value?.type

  if (t === 'event') return [
    OVERVIEW_TAB,
    { key: 'applications', label: 'Заявки участников', icon: 'ClipboardList', kind: 'applications' },
    { key: 'tickets',      label: 'Билеты',             icon: 'Ticket',        kind: 'tickets' },
    { key: 'status',       label: 'Статус события',     icon: 'CalendarCheck', kind: 'settings', settingsSection: 'sec-event', settingsDesc: 'Дата, статус и детали мероприятия' },
    { key: 'schedule',     label: 'Программа',          icon: 'Clock',         kind: 'settings', settingsSection: 'sec-event', settingsDesc: 'Расписание мероприятия' },
    INBOX_TAB,
    SCHEDULED_TAB,
    BALANCE_TAB,
  ]

  if (t === 'artist') return [
    OVERVIEW_TAB,
    { key: 'orders',   label: 'Заказы',    icon: 'Palette',     kind: 'orders' },
    { key: 'members',  label: 'Участники', icon: 'Users',       kind: 'applications' },
    { key: 'todo',     label: 'Todolist',  icon: 'CheckSquare', kind: 'todolist' },
    { key: 'price',    label: 'Прайс',     icon: 'Tag',         kind: 'settings', settingsDesc: 'Цены и услуги — настраиваются в общих настройках' },
    INBOX_TAB,
    SCHEDULED_TAB,
    BALANCE_TAB,
  ]

  if (t === 'creative') return [
    OVERVIEW_TAB,
    { key: 'orders',  label: 'Заказы',    icon: 'Scissors',    kind: 'orders' },
    { key: 'members', label: 'Участники', icon: 'Users',       kind: 'applications' },
    { key: 'todo',    label: 'Todolist',  icon: 'CheckSquare', kind: 'todolist' },
    { key: 'price',   label: 'Прайс',     icon: 'Tag',         kind: 'settings', settingsSection: 'sec-prices', settingsDesc: 'Цены и услуги' },
    INBOX_TAB,
    SCHEDULED_TAB,
    BALANCE_TAB,
  ]

  if (t === 'news') return [
    OVERVIEW_TAB,
    { key: 'team', label: 'Редакция', icon: 'Users', kind: 'settings', settingsSection: 'sec-members', settingsDesc: 'Состав редакции и роли' },
    INBOX_TAB,
    SCHEDULED_TAB,
    BALANCE_TAB,
  ]

  if (t === 'shop') return [
    OVERVIEW_TAB,
    { key: 'orders',   label: 'Заказы',      icon: 'Package',     kind: 'orders' },
    { key: 'members',  label: 'Покупатели',  icon: 'Users',       kind: 'applications' },
    { key: 'goods',    label: 'Каталог',     icon: 'ShoppingBag', kind: 'settings', settingsSection: 'sec-prices', settingsDesc: 'Товары магазина' },
    INBOX_TAB,
    SCHEDULED_TAB,
    BALANCE_TAB,
  ]

  // community / static / brand
  return [
    OVERVIEW_TAB,
    { key: 'members', label: 'Участники', icon: 'Users', kind: 'applications' },
    INBOX_TAB,
    SCHEDULED_TAB,
    BALANCE_TAB,
  ]
})

// Active tab is driven by ?tab= so it stays in sync with the left AppSidebar's
// admin-tools buttons (which read/write the same query param) and survives refresh.
const activeTab = computed<string>({
  get() {
    const q = route.query.tab as string | undefined
    if (q && toolTabs.value.some(t => t.key === q)) return q
    return toolTabs.value[0]?.key ?? ''
  },
  set(key) {
    if (!key || key === activeTab.value) return
    router.replace({ query: { ...route.query, tab: key } })
  },
})

const activeToolTab = computed(() => toolTabs.value.find(t => t.key === activeTab.value) ?? null)
const inboxCount = computed(() => (group.value ? messagesStore.groupInboxCounts[group.value.id] ?? 0 : 0))

function openSettingsSection(tab: ToolTab) {
  router.push({
    name: 'group-settings',
    params: { slugOrId: (group.value as any)?.slug ?? route.params.slugOrId },
    ...(tab.settingsSection ? { query: { section: tab.settingsSection } } : {}),
  })
}

async function load() {
  loading.value = true
  try {
    await groupsStore.loadGroup(route.params.slugOrId as string)
    if (authStore.user && !groupsStore.myGroups.length) await groupsStore.loadMyGroups()
    if (isAdmin.value && group.value && toolTabs.value.some(t => t.kind === 'inbox')) {
      messagesStore.fetchGroupInboxCount(group.value.id)
    }
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => route.params.slugOrId, load)
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader v-model:nsfwMode="nsfwMode" />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-8 pb-28 md:pb-10">
      <AppSidebar />

      <main class="flex-1 min-w-0">
        <button class="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors"
          @click="router.push({ name: 'group-detail', params: { slugOrId: route.params.slugOrId } })">
          <BIcon name="ArrowLeft" class="w-4 h-4" /> Назад к группе
        </button>

        <div v-if="loading" class="text-center py-16">
          <div class="h-8 w-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>

        <div v-else-if="!group" class="text-center py-16 text-white/40">Группа не найдена</div>

        <div v-else-if="!isAdmin" class="text-center py-16 space-y-3">
          <BIcon name="Lock" class="w-8 h-8 text-white/20 mx-auto" />
          <p class="text-white/40 text-sm">Доступно только администраторам группы</p>
        </div>

        <template v-else>
          <div class="flex items-center gap-1.5 mb-5">
            <BIcon name="LayoutDashboard" class="w-4 h-4 text-brand-accent" />
            <h1 class="text-lg font-bold text-white">Инструменты — {{ group.name }}</h1>
          </div>

          <!-- Tabs -->
          <div class="flex items-center gap-2 mb-5 flex-wrap">
            <button v-for="tab in toolTabs" :key="tab.key"
              @click="activeTab = tab.key"
              :class="[
                'relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border',
                activeTab === tab.key
                  ? 'bg-brand-accent/20 border-brand-accent/40 text-brand-accent'
                  : 'bg-brand-card border-brand-border text-white/55 hover:text-white hover:border-white/20'
              ]">
              <BIcon :name="tab.icon" class="w-3.5 h-3.5" /> {{ tab.label }}
              <span v-if="tab.kind === 'inbox' && inboxCount > 0"
                class="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-brand-error text-white text-[10px] font-extrabold leading-none">
                {{ inboxCount > 99 ? '99+' : inboxCount }}
              </span>
            </button>
          </div>

          <!-- Tab content -->
          <Transition name="tool-tab" mode="out-in">
            <div v-if="activeToolTab" :key="activeToolTab.key">
              <OverviewPanel v-if="activeToolTab.kind === 'overview'"
                :group-id="group.id" />

              <ApplicationsPanel v-else-if="activeToolTab.kind === 'applications'"
                :group-id="group.id" :group-type="group.type" />

              <TicketsPanel v-else-if="activeToolTab.kind === 'tickets'"
                :group-id="group.id" />

              <TodolistPanel v-else-if="activeToolTab.kind === 'todolist'"
                :group-id="group.id" />

              <OrdersPanel v-else-if="activeToolTab.kind === 'orders'"
                :group-id="group.id" :group-slug="(group as any).slug ?? group.id" :business-enabled="group.business_enabled" />

              <BalancePanel v-else-if="activeToolTab.kind === 'balance'"
                :group-id="group.id" :group-slug="(group as any).slug ?? group.id" :donations-enabled="!!(group as any).donations_enabled" />

              <InboxPanel v-else-if="activeToolTab.kind === 'inbox'"
                :group-id="group.id" />

              <ScheduledPanel v-else-if="activeToolTab.kind === 'scheduled'"
                :group-id="group.id" />

              <div v-else-if="activeToolTab.kind === 'settings'"
                class="bg-brand-card border border-brand-border rounded-3xl p-8 text-center space-y-4">
                <div class="w-14 h-14 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center mx-auto">
                  <BIcon :name="activeToolTab.icon" class="w-7 h-7 text-brand-accent" />
                </div>
                <div>
                  <p class="text-white font-bold">{{ activeToolTab.label }}</p>
                  <p class="text-white/40 text-sm mt-1">{{ activeToolTab.settingsDesc }}</p>
                </div>
                <button @click="openSettingsSection(activeToolTab)"
                  class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-accent text-white text-sm font-bold hover:bg-brand-accent-plus transition-all shadow-lg shadow-brand-accent/25">
                  <BIcon name="Settings" class="w-4 h-4" /> Открыть в настройках
                </button>
              </div>
            </div>
          </Transition>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.tool-tab-enter-active,
.tool-tab-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.tool-tab-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.tool-tab-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
