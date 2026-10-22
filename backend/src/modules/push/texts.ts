// Тексты системных уведомлений по типам. Пол отправителя в push не известен, поэтому формулировки нейтральные.
const SOCIAL: Record<string, string> = {
  LIKE: 'поставил(а) лайк вашей публикации',
  COMMENT: 'прокомментировал(а) вашу публикацию',
  REPAW: 'поставил(а) RePaw вашей публикации',
  FOLLOW: 'подписался(ась) на вас',
  MENTION: 'упомянул(а) вас',
  FOLLOW_POST: 'опубликовал(а) новый пост',
  GROUP_POST: 'новый пост в сообществе',
  FRIEND_REQUEST: 'хочет добавить вас в друзья',
  FRIEND_ACCEPT: 'принял(а) вашу заявку в друзья',
  RELATIONSHIP_REQUEST: 'хочет быть вашим партнёром 💕',
  RELATIONSHIP_ACCEPTED: 'принял(а) ваш запрос в отношения ❤️',
  STICKER_ACCESS_REQUEST: 'хочет получить доступ к вашему стикерпаку',
  STICKER_ACCESS_APPROVED: 'одобрил(а) ваш доступ к стикерпаку',
  DONATION: 'отправил(а) вам донат',
};

const DEN: Record<string, string> = {
  den_auction_won: 'Вы выиграли аукцион в Dealers\' Den',
  den_application_accepted: 'Ваша заявка принята — заказ в очереди',
  den_application_declined: 'Заявка отклонена',
  den_order_sketch: 'Заказ: художник начал скетч',
  den_order_lineart: 'Заказ: готов скетч, идёт лайнарт',
  den_order_coloring: 'Заказ: идёт раскраска',
  den_order_paid: 'Заказчик оплатил заказ — подтвердите начало работы',
  den_order_released: 'Заказчик подтвердил работу — оплата зачислена на ваш кошелёк',
  den_order_progress: 'Художник выложил новый этап вашего заказа',
  den_order_finished: 'Ваш заказ готов!',
  den_lot_application: 'Новая заявка на лот вашей группы',
  den_commission_booked: 'Ваша комиссия забронирована',
  den_dispute_resolved: 'Спор по заказу решён',
  den_dispute_auto_resolved: 'Спор по заказу решён автоматически',
  den_price_drop: 'Цена на лот из вашего списка снизилась',
  den_queue_moved: 'Ваше место в очереди изменилось',
  den_review: 'Новый отзыв в Dealers\' Den',
  den_slots_available: 'Освободились слоты у художника',
};

const AUTOMOD: Record<string, string> = {
  automod_warn: 'Предупреждение от модерации',
  automod_ban: 'Ваш аккаунт заблокирован',
  automod_freeze: 'Ваш аккаунт временно заморожен',
  automod_unfreeze: 'Ваш аккаунт разморожен',
  automod_clear_warns: 'Предупреждения сняты',
  automod_appeal_accepted: 'Ваша апелляция принята',
  automod_appeal_rejected: 'Ваша апелляция отклонена',
};

export type PushKind = 'message' | 'event' | 'critical';

export interface NotifPush { title?: string; body: string; kind: PushKind }

/** Текст и категория push для уведомления; `who` — имя отправителя (для социальных типов). */
export function notificationPushContent(type: string, meta: unknown): NotifPush {
  const m = (meta ?? {}) as { title?: string; body?: string; reason?: string };
  const key = type.toUpperCase();
  if (SOCIAL[key]) return { body: SOCIAL[key], kind: 'event' };
  if (DEN[type]) return { body: DEN[type], kind: 'event' };
  if (type === 'admin_broadcast') return { title: m.title || undefined, body: m.body || 'Сообщение от администрации', kind: 'critical' };
  if (AUTOMOD[type]) return { body: m.reason ? `${AUTOMOD[type]}: ${m.reason}` : AUTOMOD[type], kind: 'critical' };
  return { body: 'Новое уведомление', kind: 'event' };
}
