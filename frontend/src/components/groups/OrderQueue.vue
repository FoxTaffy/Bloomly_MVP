<script setup lang="ts">
import { computed } from 'vue'
import { useGroupsStore, type Order, type OrderStatus } from '@/stores/groups'
import { useConfirm } from '@/composables/useConfirm'
import BIcon from '@/components/BIcon.vue'
import * as fmt from '@/lib/format'

const props = defineProps<{ groupId: string; isAdmin: boolean; orders: Order[] }>()
const emit = defineEmits<{
  (e: 'open-chat', order: Order): void
  (e: 'moved', order: Order): void
  (e: 'removed', orderId: string): void
}>()
const groupsStore = useGroupsStore()
const { confirmDialog } = useConfirm()

const STATUS_CONFIG: Record<OrderStatus, { label: string; colBg: string; headerColor: string; dotColor: string; cardAccent: string }> = {
  WAITING:  { label: 'Ожидание',  colBg: 'bg-[#1a1a2e]', headerColor: 'text-white/50',    dotColor: '#6b7280', cardAccent: 'border-white/10'       },
  SKETCH:   { label: 'Скетч',     colBg: 'bg-[#0d1b35]', headerColor: 'text-blue-400',    dotColor: '#60a5fa', cardAccent: 'border-blue-500/20'    },
  LINEART:  { label: 'Лайнарт',   colBg: 'bg-[#1a0d35]', headerColor: 'text-purple-400',  dotColor: '#a78bfa', cardAccent: 'border-purple-500/20'  },
  COLORING: { label: 'Раскраска', colBg: 'bg-[#2a1500]', headerColor: 'text-orange-400',  dotColor: '#fb923c', cardAccent: 'border-orange-500/20'  },
  FINISHED: { label: 'Готово',    colBg: 'bg-[#0d2218]', headerColor: 'text-emerald-400', dotColor: '#34d399', cardAccent: 'border-emerald-500/20' },
}
const STATUSES: OrderStatus[] = ['WAITING', 'SKETCH', 'LINEART', 'COLORING', 'FINISHED']

const byStatus = computed(() => {
  const map: Record<OrderStatus, Order[]> = { WAITING: [], SKETCH: [], LINEART: [], COLORING: [], FINISHED: [] }
  props.orders.forEach(o => map[o.status].push(o))
  return map
})

function deadlineState(order: Order): 'overdue' | 'soon' | null {
  if (!order.deadline_at || order.status === 'FINISHED') return null
  const diffMs = new Date(order.deadline_at).getTime() - Date.now()
  if (diffMs < 0) return 'overdue'
  if (diffMs < 24 * 60 * 60 * 1000) return 'soon'
  return null
}

const formatDeadline = (iso: string) => fmt.formatDate(iso, 'short', 'ru-RU')

async function moveNext(order: Order) {
  const idx = STATUSES.indexOf(order.status)
  if (idx >= STATUSES.length - 1) return
  const updated = await groupsStore.updateOrderStatus(props.groupId, order.id, STATUSES[idx + 1])
  emit('moved', updated)
}

async function removeOrder(id: string) {
  if (!(await confirmDialog('Удалить заказ?', { danger: true }))) return
  await groupsStore.deleteOrder(props.groupId, id)
  emit('removed', id)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between px-1">
      <p class="text-xs font-bold text-white/55 uppercase tracking-wider flex items-center gap-1.5">
        <BIcon name="LayoutDashboard" class="w-3.5 h-3.5 text-brand-accent" /> Заказы
      </p>
      <span class="text-[10px] text-white/30 font-medium">{{ orders.length }} заказов</span>
    </div>

    <div class="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1" style="scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.1) transparent">
      <div v-for="status in STATUSES" :key="status"
        class="flex-shrink-0 w-52 flex flex-col rounded-2xl overflow-hidden"
        :class="STATUS_CONFIG[status].colBg">

        <div class="flex items-center justify-between px-3 pt-2.5 pb-2">
          <div class="flex items-center gap-1.5">
            <div class="w-2 h-2 rounded-full flex-shrink-0" :style="{ background: STATUS_CONFIG[status].dotColor }" />
            <span class="text-[11px] font-bold uppercase tracking-wide" :class="STATUS_CONFIG[status].headerColor">
              {{ STATUS_CONFIG[status].label }}
            </span>
          </div>
          <span class="text-[10px] text-white/30 font-bold bg-white/5 rounded-md px-1.5 py-0.5 min-w-[18px] text-center">
            {{ byStatus[status].length }}
          </span>
        </div>

        <div class="flex flex-col gap-1.5 px-2 flex-1 pb-2">
          <div v-for="order in byStatus[status]" :key="order.id"
            class="bg-brand-card border rounded-xl p-2.5 group/card select-none"
            :class="STATUS_CONFIG[status].cardAccent">
            <p class="text-[12px] font-semibold text-white leading-snug">{{ order.title }}</p>
            <p class="text-[10px] text-white/40 mt-0.5">{{ order.customer.display_name || order.customer.username }}</p>
            <p v-if="order.description" class="text-[10px] text-white/40 mt-1 leading-relaxed line-clamp-2">{{ order.description }}</p>

            <div v-if="order.deadline_at" class="mt-1.5 inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md"
              :class="{
                'bg-brand-error/15 text-brand-error': deadlineState(order) === 'overdue',
                'bg-amber-500/15 text-amber-400': deadlineState(order) === 'soon',
                'bg-white/5 text-white/40': !deadlineState(order),
              }">
              <BIcon name="Clock" class="w-2.5 h-2.5" /> {{ formatDeadline(order.deadline_at) }}
            </div>

            <div class="flex items-center gap-1 mt-2 pt-2 border-t border-white/5 opacity-0 group-hover/card:opacity-100 transition-opacity">
              <button @click.stop="emit('open-chat', order)"
                class="text-[9px] flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white/5 text-white/45 hover:bg-white/10 hover:text-white transition-all">
                <BIcon name="MessageCircle" class="w-2.5 h-2.5" /> Чат
              </button>
              <button v-if="isAdmin && STATUSES.indexOf(status) < STATUSES.length - 1"
                @click.stop="moveNext(order)"
                class="text-[9px] flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-white/5 text-white/45 hover:bg-white/10 hover:text-white transition-all">
                <BIcon name="ArrowRight" class="w-2.5 h-2.5" /> Далее
              </button>
              <button v-if="isAdmin" @click.stop="removeOrder(order.id)"
                class="ml-auto w-5 h-5 flex items-center justify-center rounded-md text-white/25 hover:text-brand-error hover:bg-brand-error/10 transition-all">
                <BIcon name="X" class="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
