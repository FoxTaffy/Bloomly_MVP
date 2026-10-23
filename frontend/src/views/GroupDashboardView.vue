<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import OverviewPanel from '@/components/groups/panels/OverviewPanel.vue'
import LotApplicationsPanel from '@/components/groups/panels/LotApplicationsPanel.vue'
import TicketsPanel from '@/components/groups/panels/TicketsPanel.vue'
import TodolistPanel from '@/components/groups/panels/TodolistPanel.vue'
import BalancePanel from '@/components/groups/panels/BalancePanel.vue'
import InboxPanel from '@/components/groups/panels/InboxPanel.vue'
import ScheduledPanel from '@/components/groups/panels/ScheduledPanel.vue'
import OrdersDashboard from '@/components/groups/orders/OrdersDashboard.vue'
import DashboardAttention from '@/components/groups/dashboard/DashboardAttention.vue'
import { useGroupsStore } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { useGroupAlerts } from '@/composables/useGroupAlerts'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const authStore = useAuthStore()
const nsfwMode = useNsfwMode().nsfwEnabled
const activeNav = ref('groups')

const group = computed(() => groupsStore.currentGroup)
const isOwner = computed(() => group.value?.owner_id === authStore.user?.id)
const isAdmin = computed(() => isOwner.value || groupsStore.managesGroup(group.value?.id))
const loading = ref(true)

const alerts = useGroupAlerts(() => group.value?.id)

type Kind = 'overview' | 'orders' | 'lot-applications' | 'tickets' | 'todo' | 'inbox' | 'scheduled' | 'balance'
interface Tab { key: Kind; label: string; icon: string; color: string }

// Рабочие инструменты группы — всё, что не настройки
const tabs = computed<Tab[]>(() => {
  const t: string | undefined = group.value?.type
  const mk = (key: Kind, label: string, icon: string, color: string): Tab => ({ key, label, icon, color })
  const list: Tab[] = [mk('overview', 'Сводка', 'LayoutDashboard', '#60a5fa')]
  if (group.value?.den_enabled) list.push(mk('lot-applications', 'Заявки на лоты', 'Send', '#fb923c'))
  if (t === 'event') list.push(mk('tickets', 'Билеты', 'Ticket', '#a78bfa'))
  if (t === 'artist' || t === 'creative') list.push(mk('orders', 'Заказы', t === 'artist' ? 'Palette' : 'Scissors', '#34d399'), mk('todo', 'Todolist', 'CheckSquare', '#38bdf8'))
  if (t === 'shop') list.push(mk('orders', 'Заказы', 'Package', '#34d399'))
  list.push(mk('inbox', 'Обращения', 'Inbox', '#f472b6'), mk('scheduled', 'Отложенные', 'CalendarClock', '#fbbf24'), mk('balance', 'Баланс', 'Wallet', '#10b981'))
  return list
})
const hasOrders = computed(() => tabs.value.some(t => t.key === 'orders'))

const section = computed<Kind>(() => {
  const q = route.query.section as string | undefined
  return tabs.value.find(t => t.key === q)?.key ?? 'overview'
})
function open(key: string) {
  router.replace({ query: { ...route.query, section: key } })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Бейдж вкладки: красный, если что-то горит или ждёт ответа */
function badge(key: Kind): number {
  if (key === 'lot-applications') return alerts.lots.value
  if (key === 'inbox') return alerts.inbox.value
  if (key === 'orders') return alerts.overdue.value
  return 0
}

async function load() {
  loading.value = true
  try {
    await groupsStore.loadGroup(route.params.slugOrId as string)
    if (authStore.user && !groupsStore.myGroups.length) await groupsStore.loadMyGroups()
    const g = group.value
    if (!g) return
    if (!isAdmin.value) {
      // Для остальных всё как раньше
      router.replace({ name: 'group-detail', params: { slugOrId: route.params.slugOrId } })
      return
    }
    alerts.refresh({ den: !!g.den_enabled, business: hasOrders.value && g.business_enabled })
  } finally {
    loading.value = false
  }
}
onMounted(load)
watch(() => route.params.slugOrId, load)
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-brand-offwhite font-nunito">
    <AppHeader v-model:nsfwMode="nsfwMode" />

    <div class="max-w-7xl mx-auto flex pt-20 md:pt-24 px-3 md:px-4 gap-6 pb-28 md:pb-10">
      <AppSidebar v-model:activeNav="activeNav" />

      <main class="flex-1 min-w-0">
        <button class="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm mb-4 transition-colors"
          @click="router.push({ name: 'group-detail', params: { slugOrId: route.params.slugOrId } })">
          <BIcon name="ArrowLeft" class="w-4 h-4" /> Назад к группе
        </button>

        <div v-if="loading" class="text-center py-16">
          <div class="h-8 w-8 border-2 border-brand-accent border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
        <div v-else-if="!group" class="text-center py-16 text-white/40">Группа не найдена</div>

        <template v-else-if="isAdmin">
          <header class="flex flex-wrap items-center gap-4 mb-5">
            <img v-if="group.avatar_url" :src="group.avatar_url" alt=""
              class="w-12 h-12 rounded-2xl object-cover border border-brand-border shrink-0" />
            <div v-else class="w-12 h-12 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center shrink-0">
              <BIcon name="LayoutDashboard" class="w-5 h-5 text-brand-accent" />
            </div>
            <div class="min-w-0 flex-1">
              <h1 class="text-2xl font-extrabold text-white tracking-tight">Дашборд</h1>
              <p class="text-sm text-white/45 truncate">{{ group.name }}</p>
            </div>
            <router-link :to="{ name: 'group-settings', params: { slugOrId: route.params.slugOrId } }"
              class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-card border border-brand-border text-xs font-semibold text-white/60 hover:text-white hover:border-white/20 transition-colors">
              <BIcon name="Settings" class="w-3.5 h-3.5" /> Настройки группы
            </router-link>
          </header>

          <nav class="flex gap-2 overflow-x-auto pb-1 mb-5 no-scrollbar" aria-label="Разделы дашборда">
            <button v-for="t in tabs" :key="t.key" type="button"
              class="shrink-0 inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold border transition-all"
              :class="section === t.key ? 'text-white border-transparent' : 'text-white/55 border-brand-border bg-brand-card hover:text-white hover:border-white/20'"
              :style="section === t.key ? { background: t.color + '26', boxShadow: `inset 0 0 0 1px ${t.color}55` } : {}"
              @click="open(t.key)">
              <BIcon :name="t.icon" class="w-3.5 h-3.5" :style="section === t.key ? { color: t.color } : {}" />
              {{ t.label }}
              <span v-if="badge(t.key) > 0"
                class="min-w-4 h-4 px-1 rounded-full bg-brand-error text-white text-[10px] font-extrabold leading-4 text-center">
                {{ badge(t.key) > 99 ? '99+' : badge(t.key) }}
              </span>
            </button>
          </nav>

          <div class="stack-y-5">
            <template v-if="section === 'overview'">
              <DashboardAttention :overdue="alerts.overdue.value" :soon="alerts.soon.value" :lots="alerts.lots.value" :inbox="alerts.inbox.value"
                :show-orders="hasOrders && group.business_enabled" :show-lots="!!group.den_enabled" @open="open" />
              <OverviewPanel :group-id="group.id" />
            </template>

            <template v-else-if="section === 'orders'">
              <div v-if="!group.business_enabled" class="bg-brand-card border border-brand-border rounded-3xl py-16 text-center stack-y-3">
                <BIcon name="Briefcase" class="w-8 h-8 text-white/20 mx-auto" />
                <p class="text-white/40 text-sm">Приём заказов не включён для этой группы</p>
                <router-link :to="{ name: 'group-settings', params: { slugOrId: route.params.slugOrId } }"
                  class="text-brand-accent text-sm hover:underline">Включить в настройках</router-link>
              </div>
              <OrdersDashboard v-else :group-id="group.id" :group-slug="group.slug ?? group.id" />
            </template>

            <LotApplicationsPanel v-else-if="section === 'lot-applications'" :group-id="group.id" />
            <TicketsPanel v-else-if="section === 'tickets'" :group-id="group.id" />
            <TodolistPanel v-else-if="section === 'todo'" :group-id="group.id" />
            <InboxPanel v-else-if="section === 'inbox'" :group-id="group.id" />
            <ScheduledPanel v-else-if="section === 'scheduled'" :group-id="group.id" />
            <BalancePanel v-else-if="section === 'balance'"
              :group-id="group.id" :group-slug="group.slug ?? group.id" :donations-enabled="!!group.donations_enabled" />
          </div>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
</style>
