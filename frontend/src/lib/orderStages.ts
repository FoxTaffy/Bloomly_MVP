// Этапы заказа: одни и те же подписи и цвета в очереди, карточке в чате и на странице заказа.
import type { OrderStatus } from '@/stores/groups'

export const ORDER_STAGES: OrderStatus[] = ['WAITING', 'SKETCH', 'LINEART', 'COLORING', 'FINISHED']

export const ORDER_STAGE_LABEL: Record<OrderStatus, string> = {
  WAITING: 'Ожидание', SKETCH: 'Скетч', LINEART: 'Лайнарт', COLORING: 'Раскраска', FINISHED: 'Готово',
}

export const ORDER_STAGE_COLOR: Record<OrderStatus, string> = {
  WAITING: '#6b7280', SKETCH: '#60a5fa', LINEART: '#a78bfa', COLORING: '#fb923c', FINISHED: '#34d399',
}

/** Сколько дней осталось до срока (отрицательное — просрочено); null — срок не задан или заказ готов */
export function daysLeft(deadlineIso: string | null | undefined): number | null {
  if (!deadlineIso) return null
  return Math.ceil((new Date(deadlineIso).getTime() - Date.now()) / 86_400_000)
}

export function deadlineText(deadlineIso: string | null | undefined, finished: boolean): { text: string; tone: 'ok' | 'soon' | 'late' | 'none' } {
  if (finished) return { text: 'Завершён', tone: 'ok' }
  if (!deadlineIso) return { text: 'Срок не задан', tone: 'none' }
  const d = daysLeft(deadlineIso)!
  const date = new Date(deadlineIso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  if (d < 0) return { text: `Просрочен на ${-d} дн. · ${date}`, tone: 'late' }
  if (d === 0) return { text: `Сегодня · ${date}`, tone: 'soon' }
  if (d <= 2) return { text: `Осталось ${d} дн. · ${date}`, tone: 'soon' }
  return { text: `До ${date} · ${d} дн.`, tone: 'ok' }
}

export const DEADLINE_TONE_CLASS: Record<'ok' | 'soon' | 'late' | 'none', string> = {
  ok: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  soon: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  late: 'text-brand-error bg-brand-error/10 border-brand-error/25',
  none: 'text-white/45 bg-white/5 border-white/10',
}

/**
 * Общий статус заказа для заказчика и художника: пока не оплачен — «Ожидает оплаты», после подтверждения
 * оплаты и до готовности — «В процессе» (с конкретным этапом рядом), в конце — «Готово».
 */
export function orderStatePill(o: { status: OrderStatus; payment_status?: string }): { label: string; color: string } {
  if (o.status === 'FINISHED') return { label: 'Готово', color: ORDER_STAGE_COLOR.FINISHED }
  if (o.status !== 'WAITING') return { label: 'В процессе', color: '#f59e0b' }
  if (o.payment_status === 'unpaid') return { label: 'Ожидает оплаты', color: '#f59e0b' }
  if (o.payment_status === 'reported') return { label: 'Оплата отмечена', color: '#60a5fa' }
  return { label: 'В очереди', color: ORDER_STAGE_COLOR.WAITING }
}
