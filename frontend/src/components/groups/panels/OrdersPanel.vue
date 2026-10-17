<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import OrderQueue from '@/components/groups/OrderQueue.vue'
import { useGroupsStore, type Order, type OrderStatus } from '@/stores/groups'
import { useMessagesStore } from '@/stores/messages'

const props = defineProps<{
  groupId: string
  groupSlug: string
  businessEnabled: boolean
}>()

const router = useRouter()
const groupsStore = useGroupsStore()
const messagesStore = useMessagesStore()

const loading = ref(false)
const orders = ref<Order[]>([])
const stats = ref<{ postsCount: number; messagesCount: number; ordersByStatus: Record<OrderStatus, number> } | null>(null)

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

async function load() {
  if (!props.groupId || !props.businessEnabled) return
  loading.value = true
  try {
    orders.value = await groupsStore.fetchOrders(props.groupId)
    stats.value = await groupsStore.fetchBusinessStats(props.groupId)
  } finally {
    loading.value = false
  }
}

function onOrderMoved(updated: Order) {
  const i = orders.value.findIndex(o => o.id === updated.id)
  if (i !== -1) orders.value[i] = updated
  groupsStore.fetchBusinessStats(props.groupId).then(s => { stats.value = s })
}

function onOrderRemoved(id: string) {
  orders.value = orders.value.filter(o => o.id !== id)
  groupsStore.fetchBusinessStats(props.groupId).then(s => { stats.value = s })
}

async function openChat(order: Order) {
  if (!order.conversation_id) return
  await messagesStore.selectConversation(order.conversation_id)
  router.push({ name: 'messages' })
}

watch(() => props.groupId, load)
onMounted(load)
</script>

<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden">
    <div class="px-6 py-5 border-b border-brand-border flex items-center gap-3">
      <div class="w-10 h-10 rounded-2xl bg-brand-accent/15 border border-brand-accent/25 flex items-center justify-center shrink-0">
        <BIcon name="Briefcase" class="w-5 h-5 text-brand-accent" />
      </div>
      <div class="flex-1 min-w-0">
        <h1 class="text-lg font-extrabold text-white">Заказы</h1>
        <p class="text-xs text-white/40">Очередь клиентских заказов</p>
      </div>
    </div>

    <div v-if="!businessEnabled" class="px-6 py-16 text-center stack-y-3">
      <BIcon name="Briefcase" class="w-8 h-8 text-white/20 mx-auto" />
      <p class="text-white/40 text-sm">Приём заказов не включён для этой группы</p>
      <button @click="router.push({ name: 'group-settings', params: { slugOrId: groupSlug } })"
        class="text-brand-accent text-sm hover:underline">Включить в настройках</button>
    </div>

    <div v-else-if="loading" class="px-6 py-16 flex justify-center">
      <div class="w-8 h-8 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
    </div>

    <div v-else class="p-6">
      <!-- Stats strip -->
      <div v-if="stats" class="grid grid-cols-3 gap-3 mb-5">
        <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
          <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">Посты</p>
          <p class="text-xl font-bold text-white mt-0.5">{{ stats.postsCount }}</p>
        </div>
        <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
          <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">Сообщения</p>
          <p class="text-xl font-bold text-white mt-0.5">{{ stats.messagesCount }}</p>
        </div>
        <div class="bg-brand-bg border border-brand-border rounded-2xl px-4 py-3">
          <p class="text-[10px] text-white/40 uppercase tracking-wide font-bold">Заказы</p>
          <p class="text-xl font-bold text-white mt-0.5">{{ orders.length }}</p>
        </div>
      </div>

      <OrderQueue :group-id="groupId" :is-admin="true" :orders="orders"
        @open-chat="openChat" @moved="onOrderMoved" @removed="onOrderRemoved" />

      <!-- Deadlines -->
      <div v-if="deadlineList.length" class="mt-6">
        <p class="text-xs font-bold text-white/55 uppercase tracking-wider mb-2 px-1">Дедлайны</p>
        <div class="stack-y-1.5">
          <div v-for="order in deadlineList" :key="order.id"
            class="flex items-center justify-between bg-brand-bg border border-brand-border rounded-xl px-3.5 py-2.5">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-white truncate">{{ order.title }}</p>
              <p class="text-[11px] text-white/40">{{ order.customer.display_name || order.customer.username }} · {{ STATUS_LABEL[order.status] }}</p>
            </div>
            <span class="text-xs font-bold px-2 py-1 rounded-lg shrink-0"
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
    </div>
  </div>
</template>
