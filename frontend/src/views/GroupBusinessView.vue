<script setup lang="ts">
import { apiErrorMessage } from '@/lib/apiError'
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppSidebar from '@/components/AppSidebar.vue'
import BIcon from '@/components/BIcon.vue'
import OrderQueue from '@/components/groups/OrderQueue.vue'
import { useGroupsStore, type Order, type OrderStatus, type BusinessStats } from '@/stores/groups'
import { useAuthStore } from '@/stores/auth'
import { useMessagesStore } from '@/stores/messages'
import { useNsfwMode } from '@/composables/useNsfwMode'

const route = useRoute()
const router = useRouter()
const groupsStore = useGroupsStore()
const authStore = useAuthStore()
const messagesStore = useMessagesStore()
const nsfwMode = useNsfwMode().nsfwEnabled
const activeNav = ref('groups')

const group = computed(() => groupsStore.currentGroup)
const isOwner = computed(() => group.value?.owner_id === authStore.user?.id)
const isAdmin = computed(() => {
  if (isOwner.value) return true
  return groupsStore.managesGroup(group.value?.id)
})

const loading = ref(true)
const orders = ref<Order[]>([])
const stats = ref<BusinessStats | null>(null)

const STATUS_LABEL: Record<OrderStatus, string> = {
  WAITING: 'Ожидание', SKETCH: 'Скетч', LINEART: 'Лайнарт', COLORING: 'Раскраска', FINISHED: 'Готово',
}

const deadlineList = computed(() =>
  orders.value
    .filter(o => o.deadline_at && o.status !== 'FINISHED')
    .sort((a, b) => new Date(a.deadline_at!).getTime() - new Date(b.deadline_at!).getTime()),
)

function deadlineState(order: Order): 'overdue' | 'soon' | null {
  if (!order.deadline_at) return null
  const diffMs = new Date(order.deadline_at).getTime() - Date.now()
  if (diffMs < 0) return 'overdue'
  if (diffMs < 24 * 60 * 60 * 1000) return 'soon'
  return null
}

async function loadOrders() {
  if (!group.value) return
  orders.value = await groupsStore.fetchOrders(group.value.id)
}

async function loadStats() {
  if (!group.value || !isAdmin.value) return
  stats.value = await groupsStore.fetchBusinessStats(group.value.id)
}

async function load() {
  loading.value = true
  try {
    await groupsStore.loadGroup(route.params.slugOrId as string)
    if (authStore.user && !groupsStore.myGroups.length) await groupsStore.loadMyGroups()
    if (group.value?.business_enabled) {
      await loadOrders()
      await loadStats()
    }
  } finally {
    loading.value = false
  }
}
onMounted(load)

function onOrderMoved(updated: Order) {
  const i = orders.value.findIndex(o => o.id === updated.id)
  if (i !== -1) orders.value[i] = updated
  loadStats()
}

function onOrderRemoved(id: string) {
  orders.value = orders.value.filter(o => o.id !== id)
  loadStats()
}

async function openChat(order: Order) {
  if (!order.conversation_id) return
  await messagesStore.selectConversation(order.conversation_id)
  router.push({ name: 'messages' })
}

// ── Customer: place order form ──────────────────────────────────────────────
const createForm = reactive({ title: '', description: '', deadlineAt: '' })
const creating = ref(false)
const createError = ref('')

async function submitOrder() {
  if (!group.value || !createForm.title.trim()) return
  creating.value = true
  createError.value = ''
  try {
    const order = await groupsStore.createOrder(group.value.id, {
      title: createForm.title.trim(),
      description: createForm.description.trim() || undefined,
      deadlineAt: createForm.deadlineAt || undefined,
    })
    orders.value.unshift(order)
    createForm.title = ''
    createForm.description = ''
    createForm.deadlineAt = ''
  } catch (e) {
    createError.value = apiErrorMessage(e) || 'Не удалось оформить заказ'
  } finally {
    creating.value = false
  }
}
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

        <div v-else-if="!group.business_enabled" class="text-center py-16 space-y-3">
          <BIcon name="Briefcase" class="w-8 h-8 text-white/20 mx-auto" />
          <p class="text-white/40 text-sm">Бизнес-вкладка не включена для этой группы</p>
          <button v-if="isOwner" @click="router.push({ name: 'group-settings', params: { slugOrId: route.params.slugOrId } })"
            class="text-brand-accent text-sm hover:underline">Включить в настройках</button>
        </div>

        <!-- ── Owner/admin dashboard ────────────────────────────────────── -->
        <template v-else-if="isAdmin">
          <div class="flex items-center gap-1.5 mb-4">
            <BIcon name="Briefcase" class="w-4 h-4 text-brand-accent" />
            <h1 class="text-lg font-bold text-white">Бизнес</h1>
          </div>

          <!-- Stats strip -->
          <div v-if="stats" class="grid grid-cols-3 gap-3 mb-5">
            <div class="bg-brand-card border border-brand-border rounded-2xl px-4 py-3">
              <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">Посты</p>
              <p class="text-xl font-bold text-white mt-0.5">{{ stats.postsCount }}</p>
            </div>
            <div class="bg-brand-card border border-brand-border rounded-2xl px-4 py-3">
              <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">Сообщения</p>
              <p class="text-xl font-bold text-white mt-0.5">{{ stats.messagesCount }}</p>
            </div>
            <div class="bg-brand-card border border-brand-border rounded-2xl px-4 py-3">
              <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">Заказы</p>
              <p class="text-xl font-bold text-white mt-0.5">{{ orders.length }}</p>
            </div>
          </div>

          <OrderQueue :group-id="group.id" :is-admin="true" :orders="orders"
            @open-chat="openChat" @moved="onOrderMoved" @removed="onOrderRemoved" />

          <!-- Deadlines -->
          <div v-if="deadlineList.length" class="mt-6">
            <p class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 px-1">Дедлайны</p>
            <div class="space-y-1.5">
              <div v-for="order in deadlineList" :key="order.id"
                class="flex items-center justify-between bg-brand-card border border-brand-border rounded-xl px-3.5 py-2.5">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-white truncate">{{ order.title }}</p>
                  <p class="text-[11px] text-white/40">{{ order.customer.display_name || order.customer.username }} · {{ STATUS_LABEL[order.status] }}</p>
                </div>
                <span class="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0"
                  :class="{
                    'bg-brand-error/15 text-brand-error': deadlineState(order) === 'overdue',
                    'bg-amber-500/15 text-amber-400': deadlineState(order) === 'soon',
                    'bg-white/5 text-white/50': !deadlineState(order),
                  }">
                  {{ new Date(order.deadline_at!).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- ── Customer view ────────────────────────────────────────────── -->
        <template v-else>
          <div class="flex items-center gap-1.5 mb-4">
            <BIcon name="Briefcase" class="w-4 h-4 text-brand-accent" />
            <h1 class="text-lg font-bold text-white">Заказ у {{ group.name }}</h1>
          </div>

          <div class="bg-brand-card border border-brand-border rounded-2xl p-4 mb-5 space-y-3">
            <p class="text-sm font-bold text-white">Оформить заказ</p>
            <input v-model="createForm.title" placeholder="Что вы хотите заказать?"
              class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand-accent/60 transition-colors" />
            <textarea v-model="createForm.description" placeholder="Описание (необязательно)" rows="3"
              class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand-accent/60 transition-colors resize-none" />
            <div class="space-y-1">
              <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">Желаемый дедлайн (необязательно)</p>
              <input v-model="createForm.deadlineAt" type="date"
                class="w-full bg-brand-bg border border-brand-border rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-accent/60 transition-colors" />
            </div>
            <p v-if="createError" class="text-xs text-brand-error">{{ createError }}</p>
            <button @click="submitOrder" :disabled="creating || !createForm.title.trim()"
              class="w-full px-4 py-2.5 text-sm font-semibold bg-brand-accent text-white rounded-xl hover:bg-brand-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              {{ creating ? 'Отправка...' : 'Оформить заказ' }}
            </button>
          </div>

          <p class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 px-1">Мои заказы</p>
          <div v-if="!orders.length" class="text-center py-10 text-white/30 text-sm">Заказов пока нет</div>
          <div v-else class="space-y-1.5">
            <div v-for="order in orders" :key="order.id"
              class="flex items-center justify-between bg-brand-card border border-brand-border rounded-xl px-3.5 py-2.5">
              <div class="min-w-0">
                <p class="text-sm font-semibold text-white truncate">{{ order.title }}</p>
                <p class="text-[11px] text-white/40">{{ STATUS_LABEL[order.status] }}</p>
              </div>
              <button @click="openChat(order)"
                class="text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/5 text-white/55 hover:bg-white/10 hover:text-white transition-all flex-shrink-0">
                <BIcon name="MessageCircle" class="w-3 h-3" /> Чат
              </button>
            </div>
          </div>
        </template>
      </main>
    </div>
  </div>
</template>
