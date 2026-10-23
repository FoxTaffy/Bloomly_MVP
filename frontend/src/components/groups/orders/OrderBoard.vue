<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useGroupsStore, type Order, type OrderStatus } from '@/stores/groups'
import { useConfirm } from '@/composables/useConfirm'
import { errorMessage } from '@/lib/apiError'
import OrderEditModal from '@/components/groups/OrderEditModal.vue'
import OrderStartModal from '@/components/groups/OrderStartModal.vue'
import OrderCard from './OrderCard.vue'
import { STATUSES, STATUS_META, needsPayment } from './orderMeta'

const props = defineProps<{ groupId: string; groupSlug: string; orders: Order[]; avgDays?: number | null }>()
const emit = defineEmits<{
  (e: 'open-chat', order: Order): void
  (e: 'moved', order: Order): void
  (e: 'removed', orderId: string): void
}>()

const router = useRouter()
const groupsStore = useGroupsStore()
const { confirmDialog } = useConfirm()

const byStatus = computed(() => {
  const map: Record<OrderStatus, Order[]> = { WAITING: [], SKETCH: [], LINEART: [], COLORING: [], FINISHED: [] }
  props.orders.forEach(o => map[o.status].push(o))
  return map
})

const editing = ref<Order | null>(null)
const starting = ref<Order | null>(null)
const startTarget = ref<OrderStatus>('SKETCH')
const startBusy = ref(false)
const startError = ref('')
const moveError = ref('')
const busyIds = ref<Set<string>>(new Set())

function openOrder(order: Order) {
  router.push({ name: 'group-order', params: { slugOrId: props.groupSlug, orderId: order.id } })
}

// ── Перенос заказа на другой этап (кнопка «Далее» и drag-and-drop) ──────────
async function moveTo(order: Order, target: OrderStatus) {
  if (target === order.status || busyIds.value.has(order.id)) return
  moveError.value = ''
  // Старт работы: исполнитель сам ставит дедлайн
  if (!order.started_at && target !== 'WAITING') {
    startError.value = ''
    startTarget.value = target
    starting.value = order
    return
  }
  if (target === 'WAITING' && !(await confirmDialog('Вернуть заказ в ожидание? Работа будет считаться не начатой.'))) return
  await applyStatus(order, target)
}

function moveNext(order: Order) {
  const next = STATUSES[STATUSES.indexOf(order.status) + 1]
  if (next) moveTo(order, next)
}

/** Оптимистичный перенос: карточка встаёт в колонку сразу, при ошибке возвращается обратно */
async function applyStatus(order: Order, target: OrderStatus) {
  busyIds.value.add(order.id)
  emit('moved', { ...order, status: target })
  try {
    emit('moved', await groupsStore.updateOrderStatus(props.groupId, order.id, target))
  } catch (e) {
    emit('moved', order)
    moveError.value = errorMessage(e) ?? 'Не удалось перенести заказ'
  } finally {
    busyIds.value.delete(order.id)
  }
}

async function confirmStart(deadlineAt: string) {
  const order = starting.value
  if (!order) return
  const target = startTarget.value
  startBusy.value = true
  startError.value = ''
  try {
    let updated: Order
    if (needsPayment(order)) {
      // Оплачиваемый заказ стартует через подтверждение оплаты (сразу «Скетч»)
      updated = await groupsStore.confirmOrderPayment(props.groupId, order.id, deadlineAt)
      if (target !== updated.status) updated = await groupsStore.updateOrderStatus(props.groupId, order.id, target)
    } else {
      updated = await groupsStore.updateOrderStatus(props.groupId, order.id, target, deadlineAt)
    }
    emit('moved', updated)
    starting.value = null
  } catch (e) {
    startError.value = errorMessage(e) ?? 'Не удалось начать работу'
  } finally {
    startBusy.value = false
  }
}

async function removeOrder(order: Order) {
  if (!(await confirmDialog('Удалить заказ?', { danger: true }))) return
  await groupsStore.deleteOrder(props.groupId, order.id)
  emit('removed', order.id)
}

// ── Drag-and-drop ───────────────────────────────────────────────────────────
const draggingId = ref<string | null>(null)
const overStatus = ref<OrderStatus | null>(null)
const scroller = ref<HTMLElement | null>(null)
const draggingFrom = computed(() => props.orders.find(o => o.id === draggingId.value)?.status ?? null)

function onDragStart(order: Order, ev: DragEvent) {
  draggingId.value = order.id
  if (ev.dataTransfer) {
    ev.dataTransfer.effectAllowed = 'move'
    ev.dataTransfer.setData('text/plain', order.id) // Firefox не начинает перенос без данных
  }
}

function onDragEnd() {
  draggingId.value = null
  overStatus.value = null
}

function onColumnDragOver(ev: DragEvent, status: OrderStatus) {
  if (!draggingId.value) return
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  overStatus.value = status
}

function onColumnDragLeave(ev: DragEvent, status: OrderStatus) {
  // dragleave срабатывает и при заходе на дочерние элементы — сбрасываем только при выходе из колонки
  if ((ev.currentTarget as HTMLElement).contains(ev.relatedTarget as Node | null)) return
  if (overStatus.value === status) overStatus.value = null
}

function onColumnDrop(ev: DragEvent, status: OrderStatus) {
  ev.preventDefault()
  const order = props.orders.find(o => o.id === draggingId.value)
  onDragEnd()
  if (order) moveTo(order, status)
}

/** Доска шире экрана: у краёв подкручиваем её вбок, пока тащим карточку */
function edgeScroll(ev: DragEvent) {
  const el = scroller.value
  if (!draggingId.value || !el) return
  const rect = el.getBoundingClientRect()
  const zone = 72
  if (ev.clientX < rect.left + zone) el.scrollLeft -= 18
  else if (ev.clientX > rect.right - zone) el.scrollLeft += 18
}
</script>

<template>
  <div>
    <div v-if="moveError" role="alert"
      class="mb-3 flex items-start gap-2 text-xs text-brand-error bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-2.5">
      <span class="flex-1">{{ moveError }}</span>
      <button type="button" class="shrink-0 text-brand-error/60 hover:text-brand-error" aria-label="Закрыть" @click="moveError = ''">✕</button>
    </div>

    <div ref="scroller" class="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1"
      :class="draggingId ? '' : 'snap-x snap-mandatory'"
      style="scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.12) transparent"
      @dragover="edgeScroll">
      <section v-for="status in STATUSES" :key="status"
        class="snap-start shrink-0 w-[17.5rem] flex flex-col rounded-2xl border transition-colors"
        :class="overStatus === status && draggingFrom !== status ? 'bg-white/6' : 'bg-white/3 border-white/5'"
        :style="overStatus === status && draggingFrom !== status ? { borderColor: STATUS_META[status].color + '99' } : {}"
        @dragover="onColumnDragOver($event, status)"
        @dragleave="onColumnDragLeave($event, status)"
        @drop="onColumnDrop($event, status)">

        <header class="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
          <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: STATUS_META[status].color }" />
          <h3 class="text-[11px] font-extrabold uppercase tracking-wider flex-1" :style="{ color: STATUS_META[status].color }">
            {{ STATUS_META[status].label }}
          </h3>
          <span class="text-[11px] font-bold text-white/40 bg-white/6 rounded-md px-1.5 py-0.5 min-w-5 text-center">
            {{ byStatus[status].length }}
          </span>
        </header>

        <div class="flex flex-col gap-2.5 px-2.5 pb-2.5 flex-1 min-h-24">
          <OrderCard v-for="order in byStatus[status]" :key="order.id" :order="order"
            :dragging="draggingId === order.id" :busy="busyIds.has(order.id)"
            @open="openOrder" @chat="emit('open-chat', $event)" @edit="editing = $event"
            @next="moveNext" @remove="removeOrder"
            @dragstart="onDragStart" @dragend="onDragEnd" />

          <div v-if="draggingId && draggingFrom !== status"
            class="flex items-center justify-center rounded-xl border border-dashed text-[11px] font-semibold py-4 transition-colors"
            :class="overStatus === status ? 'text-white/70' : 'border-white/10 text-white/25'"
            :style="overStatus === status ? { borderColor: STATUS_META[status].color + '99', background: STATUS_META[status].color + '14' } : {}">
            Перенести в «{{ STATUS_META[status].label }}»
          </div>
          <div v-else-if="!byStatus[status].length"
            class="flex-1 flex items-center justify-center rounded-xl border border-dashed border-white/8 text-[11px] text-white/25 py-6">
            Пусто
          </div>
        </div>
      </section>
    </div>

    <OrderStartModal v-if="starting" :order="starting" :payment-confirm="needsPayment(starting)"
      :avg-days="avgDays ?? null" :busy="startBusy" :error="startError"
      @close="starting = null" @confirm="confirmStart" />
    <OrderEditModal v-if="editing" :group-id="groupId" :order="editing"
      @close="editing = null" @saved="(o) => { emit('moved', o); editing = null }" />
  </div>
</template>
