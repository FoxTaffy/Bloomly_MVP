import { computed, reactive } from 'vue'
import { useGroupsStore, type Order } from '@/stores/groups'
import { useMessagesStore } from '@/stores/messages'
import { useListingApplicationsStore } from '@/stores/listingApplications'
import { deadlineState } from '@/components/groups/orders/orderMeta'

interface OrderAlerts { overdue: number; soon: number }

// Один на вкладку: дашборд обновляет цифры при каждом изменении заказов, кнопка группы их только читает
const orderAlerts = reactive<Record<string, OrderAlerts>>({})

export function setOrderAlerts(groupId: string, orders: Order[]) {
  orderAlerts[groupId] = {
    overdue: orders.filter(o => deadlineState(o) === 'overdue').length,
    soon: orders.filter(o => deadlineState(o) === 'soon').length,
  }
}

/** Что требует внимания админа группы: обращения, заявки на лоты и горящие дедлайны заказов */
export function useGroupAlerts(groupId: () => string | undefined) {
  const groupsStore = useGroupsStore()
  const messagesStore = useMessagesStore()
  const lotApplications = useListingApplicationsStore()

  const inbox = computed(() => { const id = groupId(); return id ? messagesStore.groupInboxCounts[id] ?? 0 : 0 })
  const lots = computed(() => { const id = groupId(); return id ? lotApplications.pendingByGroup[id] ?? 0 : 0 })
  const overdue = computed(() => { const id = groupId(); return id ? orderAlerts[id]?.overdue ?? 0 : 0 })
  const soon = computed(() => { const id = groupId(); return id ? orderAlerts[id]?.soon ?? 0 : 0 })
  /** Число на бейдже: всё, что ждёт ответа или уже горит */
  const total = computed(() => inbox.value + lots.value + overdue.value)

  /** Подтянуть счётчики группы (вызывать для админа; сеть дёргаем только по включённым инструментам) */
  async function refresh(opts: { den?: boolean; business?: boolean } = {}) {
    const id = groupId()
    if (!id) return
    const jobs: Promise<unknown>[] = [messagesStore.fetchGroupInboxCount(id)]
    if (opts.den) jobs.push(lotApplications.fetchPendingCount(id))
    if (opts.business) jobs.push(groupsStore.fetchOrders(id).then(o => setOrderAlerts(id, o)).catch(() => { /* счётчик не критичен */ }))
    await Promise.all(jobs)
  }

  return { inbox, lots, overdue, soon, total, refresh }
}
