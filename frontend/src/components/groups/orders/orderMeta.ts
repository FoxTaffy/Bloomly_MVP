import type { Order, OrderStatus } from '@/stores/groups'

export const STATUSES: OrderStatus[] = ['WAITING', 'SKETCH', 'LINEART', 'COLORING', 'FINISHED']

export const STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
  WAITING:  { label: 'Ожидание',  color: '#9ca3af' },
  SKETCH:   { label: 'Скетч',     color: '#60a5fa' },
  LINEART:  { label: 'Лайнарт',   color: '#a78bfa' },
  COLORING: { label: 'Раскраска', color: '#fb923c' },
  FINISHED: { label: 'Готово',    color: '#34d399' },
}

export type DeadlineState = 'overdue' | 'soon' | null

const DAY_MS = 24 * 60 * 60 * 1000

export function deadlineState(order: Order): DeadlineState {
  if (!order.deadline_at || order.status === 'FINISHED') return null
  const diff = new Date(order.deadline_at).getTime() - Date.now()
  if (diff < 0) return 'overdue'
  if (diff < DAY_MS) return 'soon'
  return null
}

/** «просрочен на 2 дн.» / «сегодня» / «завтра» / «через 5 дн.» */
export function deadlineRelative(iso: string): string {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / DAY_MS)
  if (days < 0) return `просрочен на ${-days} дн.`
  if (days === 0) return 'сегодня'
  if (days === 1) return 'завтра'
  return `через ${days} дн.`
}

export function customerName(order: Order): string {
  return order.customer.display_name || order.customer.username
}

/** Принятые заявки попадают в дедлайны сразу, даже пока срок не назначен (он ставится при старте работы) */
export function isTrackedForDeadline(order: Order): boolean {
  if (order.status === 'FINISHED') return false
  return !!order.deadline_at || (order.form_data as { source?: string } | null)?.source === 'listing_application'
}

export function needsPayment(order: Order): boolean {
  return order.payment_status === 'unpaid' || order.payment_status === 'reported'
}

/** Обложка карточки: первое изображение персонажа из заявки, иначе референс художника */
export function orderCover(order: Order): { url: string; nsfw: boolean } | null {
  for (const c of order.characters ?? []) {
    if (c.images[0]) return { url: c.images[0].url, nsfw: c.images[0].is_nsfw }
    if (c.extraImages[0]) return { url: c.extraImages[0], nsfw: false }
  }
  if (order.references?.[0]) return { url: order.references[0], nsfw: false }
  return null
}
