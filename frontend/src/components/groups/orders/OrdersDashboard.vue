<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useGroupsStore, type Order, type BusinessStats } from '@/stores/groups'
import { useMessagesStore } from '@/stores/messages'
import * as fmt from '@/lib/format'
import OrderBoard from './OrderBoard.vue'
import {
  STATUSES, STATUS_META, customerName, deadlineRelative, deadlineState, isTrackedForDeadline, needsPayment,
} from './orderMeta'

const props = defineProps<{ groupId: string; groupSlug: string }>()

const router = useRouter()
const groupsStore = useGroupsStore()
const messagesStore = useMessagesStore()

const loading = ref(true)
const orders = ref<Order[]>([])
const stats = ref<BusinessStats | null>(null)

async function load() {
  loading.value = true
  try {
    const [o, s] = await Promise.all([groupsStore.fetchOrders(props.groupId), groupsStore.fetchBusinessStats(props.groupId)])
    orders.value = o
    stats.value = s
  } finally {
    loading.value = false
  }
}
async function refreshStats() { stats.value = await groupsStore.fetchBusinessStats(props.groupId) }

function onMoved(updated: Order) {
  const i = orders.value.findIndex(o => o.id === updated.id)
  if (i !== -1) orders.value[i] = updated
  refreshStats()
}
function onRemoved(id: string) {
  orders.value = orders.value.filter(o => o.id !== id)
  refreshStats()
}
async function openChat(order: Order) {
  // Чат с заказчиком — от лица группы (вкладка «Группы» у заказчика)
  await messagesStore.openGroupThread(props.groupId, order.customer_id)
  router.push({ name: 'messages' })
}

watch(() => props.groupId, load)
onMounted(load)

// ── Метрики ─────────────────────────────────────────────────────────────────
const activeCount = computed(() => orders.value.filter(o => o.status !== 'FINISHED').length)
const overdueCount = computed(() => orders.value.filter(o => deadlineState(o) === 'overdue').length)
const soonCount = computed(() => orders.value.filter(o => deadlineState(o) === 'soon').length)
const awaitingPayment = computed(() => orders.value.filter(o => o.status !== 'FINISHED' && needsPayment(o)).length)

const pipeline = computed(() => STATUSES.map(s => ({
  status: s,
  count: orders.value.filter(o => o.status === s).length,
})))
const pipelineTotal = computed(() => orders.value.length)

// ── Фильтры ─────────────────────────────────────────────────────────────────
type Filter = 'all' | 'overdue' | 'soon' | 'payment'
const filter = ref<Filter>('all')
const search = ref('')

const filters = computed<{ key: Filter; label: string; count: number | null }[]>(() => [
  { key: 'all', label: 'Все', count: null },
  { key: 'overdue', label: 'Просрочены', count: overdueCount.value },
  { key: 'soon', label: 'Скоро срок', count: soonCount.value },
  { key: 'payment', label: 'Ждут оплаты', count: awaitingPayment.value },
])

const visibleOrders = computed(() => {
  const q = search.value.trim().toLowerCase()
  return orders.value.filter(o => {
    if (q && !`${o.title} ${customerName(o)} ${o.customer.username}`.toLowerCase().includes(q)) return false
    if (filter.value === 'overdue') return deadlineState(o) === 'overdue'
    if (filter.value === 'soon') return deadlineState(o) === 'soon'
    if (filter.value === 'payment') return o.status !== 'FINISHED' && needsPayment(o)
    return true
  })
})

// ── Дедлайны ────────────────────────────────────────────────────────────────
const deadlineList = computed(() =>
  orders.value
    .filter(isTrackedForDeadline)
    .sort((a, b) => (a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity) - (b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity)),
)

const avgBar = computed(() => {
  const c = stats.value?.completion
  return c ? Math.min(100, (c.count / c.required) * 100) : 0
})
</script>

<template>
  <div v-if="loading" class="py-24 flex justify-center">
    <div class="w-8 h-8 border-2 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
  </div>

  <div v-else class="stack-y-6">
    <!-- ── Сводка ───────────────────────────────────────────────────────── -->
    <section v-if="stats" class="stack-y-3" aria-label="Сводка">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="bg-brand-card border border-brand-border rounded-2xl p-4">
          <div class="flex items-center gap-2 text-white/45">
            <BIcon name="Briefcase" class="w-3.5 h-3.5" />
            <span class="text-[10px] uppercase tracking-wider font-bold">В работе</span>
          </div>
          <p class="text-2xl font-extrabold text-white mt-2 leading-none">{{ activeCount }}</p>
          <p class="text-[11px] text-white/35 mt-1.5">всего заказов: {{ orders.length }}</p>
        </div>

        <div class="bg-brand-card border border-brand-border rounded-2xl p-4">
          <div class="flex items-center gap-2 text-white/45">
            <BIcon name="Clock" class="w-3.5 h-3.5" />
            <span class="text-[10px] uppercase tracking-wider font-bold">Средний срок</span>
          </div>
          <template v-if="stats.completion.avgDays !== null">
            <p class="text-2xl font-extrabold text-white mt-2 leading-none">{{ stats.completion.avgDays }} <span class="text-sm font-bold text-white/50">дн.</span></p>
            <p class="text-[11px] text-white/35 mt-1.5">
              по {{ stats.completion.count }} работам<template v-if="stats.completion.onTimePercent !== null"> · в срок {{ stats.completion.onTimePercent }}%</template>
            </p>
          </template>
          <template v-else>
            <p class="text-2xl font-extrabold text-white/60 mt-2 leading-none">{{ stats.completion.count }}<span class="text-sm font-bold text-white/35"> из {{ stats.completion.required }}</span></p>
            <div class="h-1 rounded-full bg-white/8 mt-2.5 overflow-hidden">
              <div class="h-full bg-brand-accent rounded-full" :style="{ width: avgBar + '%' }" />
            </div>
          </template>
        </div>

        <div class="bg-brand-card border border-brand-border rounded-2xl p-4">
          <div class="flex items-center gap-2 text-white/45">
            <BIcon name="FileText" class="w-3.5 h-3.5" />
            <span class="text-[10px] uppercase tracking-wider font-bold">Посты</span>
          </div>
          <p class="text-2xl font-extrabold text-white mt-2 leading-none">{{ stats.postsCount.toLocaleString('ru-RU') }}</p>
          <p class="text-[11px] text-white/35 mt-1.5">опубликовано группой</p>
        </div>

        <div class="bg-brand-card border border-brand-border rounded-2xl p-4">
          <div class="flex items-center gap-2 text-white/45">
            <BIcon name="MessageCircle" class="w-3.5 h-3.5" />
            <span class="text-[10px] uppercase tracking-wider font-bold">Сообщения</span>
          </div>
          <p class="text-2xl font-extrabold text-white mt-2 leading-none">{{ stats.messagesCount.toLocaleString('ru-RU') }}</p>
          <p class="text-[11px] text-white/35 mt-1.5">в чатах группы</p>
        </div>
      </div>

      <!-- Воронка по этапам -->
      <div v-if="pipelineTotal" class="bg-brand-card border border-brand-border rounded-2xl p-4">
        <div class="flex h-2 rounded-full overflow-hidden gap-0.5 bg-white/5">
          <div v-for="p in pipeline.filter(x => x.count)" :key="p.status"
            class="h-full first:rounded-l-full last:rounded-r-full transition-all"
            :style="{ width: (p.count / pipelineTotal * 100) + '%', background: STATUS_META[p.status].color }" />
        </div>
        <div class="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
          <span v-for="p in pipeline" :key="p.status" class="inline-flex items-center gap-1.5 text-[11px] text-white/50">
            <span class="w-2 h-2 rounded-full" :style="{ background: STATUS_META[p.status].color }" />
            {{ STATUS_META[p.status].label }} <b class="text-white/80">{{ p.count }}</b>
          </span>
        </div>
      </div>
    </section>

    <!-- ── Доска заказов ────────────────────────────────────────────────── -->
    <section class="stack-y-3" aria-label="Доска заказов">
      <div class="flex flex-col sm:flex-row sm:items-center gap-3">
        <h2 class="text-sm font-extrabold text-white flex items-center gap-2 sm:mr-auto">
          <BIcon name="LayoutDashboard" class="w-4 h-4 text-brand-accent" /> Очередь заказов
          <span class="text-[11px] font-bold text-white/35">{{ visibleOrders.length }}</span>
        </h2>
        <div class="relative sm:w-56">
          <BIcon name="Search" class="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
          <input v-model="search" type="text" placeholder="Заказ или заказчик"
            class="w-full bg-brand-card border border-brand-border rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-hidden focus:border-brand-accent/60 transition-colors" />
        </div>
      </div>

      <div class="flex gap-2 overflow-x-auto no-scrollbar">
        <button v-for="f in filters" :key="f.key" type="button"
          class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors"
          :class="filter === f.key
            ? 'bg-brand-accent/15 border-brand-accent/40 text-white'
            : 'bg-brand-card border-brand-border text-white/50 hover:text-white hover:border-white/20'"
          @click="filter = f.key">
          {{ f.label }}
          <span v-if="f.count" class="px-1.5 rounded-full text-[10px] font-extrabold"
            :class="f.key === 'overdue' ? 'bg-brand-error/20 text-brand-error' : 'bg-white/10 text-white/70'">{{ f.count }}</span>
        </button>
      </div>

      <div v-if="!orders.length" class="bg-brand-card border border-brand-border rounded-2xl py-14 text-center stack-y-2">
        <BIcon name="Briefcase" class="w-8 h-8 text-white/20 mx-auto" />
        <p class="text-sm font-semibold text-white/60">Заказов пока нет</p>
        <p class="text-xs text-white/35">Принятые заявки и новые заказы появятся здесь</p>
      </div>
      <OrderBoard v-else :group-id="groupId" :group-slug="groupSlug" :orders="visibleOrders"
        :avg-days="stats?.completion.avgDays ?? null"
        @open-chat="openChat" @moved="onMoved" @removed="onRemoved" />
    </section>

    <!-- ── Дедлайны ─────────────────────────────────────────────────────── -->
    <section v-if="deadlineList.length" class="stack-y-3" aria-label="Дедлайны">
      <h2 class="text-sm font-extrabold text-white flex items-center gap-2">
        <BIcon name="CalendarClock" class="w-4 h-4 text-amber-400" /> Дедлайны
        <span class="text-[11px] font-bold text-white/35">{{ deadlineList.length }}</span>
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <router-link v-for="order in deadlineList" :key="order.id"
          :to="{ name: 'group-order', params: { slugOrId: groupSlug, orderId: order.id } }"
          class="flex items-center gap-3 bg-brand-card border border-brand-border rounded-2xl px-4 py-3 hover:border-white/20 transition-colors">
          <span class="w-1 self-stretch rounded-full shrink-0" :style="{ background: STATUS_META[order.status].color }" />
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold text-white truncate">{{ order.title }}</p>
            <p class="text-[11px] text-white/40 truncate">{{ customerName(order) }} · {{ STATUS_META[order.status].label }}</p>
          </div>
          <div class="text-right shrink-0">
            <template v-if="order.deadline_at">
              <p class="text-xs font-bold"
                :class="{
                  'text-brand-error': deadlineState(order) === 'overdue',
                  'text-amber-400': deadlineState(order) === 'soon',
                  'text-white/70': !deadlineState(order),
                }">{{ fmt.formatDate(order.deadline_at, 'short', 'ru-RU') }}</p>
              <p class="text-[10px] text-white/35">{{ deadlineRelative(order.deadline_at) }}</p>
            </template>
            <p v-else class="text-[11px] font-semibold text-white/40">срок не задан</p>
          </div>
        </router-link>
      </div>
    </section>
  </div>
</template>

<style scoped>
.no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
</style>
