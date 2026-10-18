import { useLangStore } from '@/stores/lang'

// Подписи вкладки «Финансы и Premium». Админка — рабочий инструмент команды, поэтому ru + en;
// остальные языки интерфейса показывают английский.
const S = {
  title: { ru: 'Финансы и Premium', en: 'Finance & Premium' },
  subtitle: { ru: 'Деньги через ЮKassa, подписки, карты и BLM. Сутки — московские.', en: 'YooKassa money, subscriptions, cards and BLM. Days are Moscow time.' },
  days7: { ru: '7 дней', en: '7 days' }, days30: { ru: '30 дней', en: '30 days' }, days90: { ru: '90 дней', en: '90 days' }, days365: { ru: 'Год', en: 'Year' },
  refresh: { ru: 'Обновить', en: 'Refresh' },
  loadFailed: { ru: 'Не удалось загрузить отчёт', en: 'Could not load the report' },
  retry: { ru: 'Повторить', en: 'Retry' },
  vsPrev: { ru: 'к прошлому периоду', en: 'vs previous period' },

  kGross: { ru: 'Выручка', en: 'Revenue' }, kGrossHint: { ru: 'оплачено через ЮKassa', en: 'paid via YooKassa' },
  kNet: { ru: 'За вычетом возвратов', en: 'Net of refunds' },
  kCommission: { ru: 'Комиссия ЮKassa', en: 'YooKassa fees' },
  kPayers: { ru: 'Платящих', en: 'Payers' }, kPayersHint: { ru: 'уникальных пользователей', en: 'unique users' },
  kAvg: { ru: 'Средний чек', en: 'Average check' },
  kRefunds: { ru: 'Возвраты', en: 'Refunds' },
  kMrr: { ru: 'MRR', en: 'MRR' }, kMrrHint: { ru: 'ежемесячная выручка подписок', en: 'monthly subscription revenue' },
  kSubs: { ru: 'Платных подписчиков', en: 'Paid subscribers' },
  kArppu: { ru: 'Доход на плательщика', en: 'Revenue per payer' },
  kFirst: { ru: 'Новых плательщиков', en: 'New payers' }, kFirstHint: { ru: 'заплатили впервые', en: 'paid for the first time' },
  payments: { ru: 'платежей', en: 'payments' },

  revTitle: { ru: 'Выручка по дням', en: 'Revenue by day' },
  revDesc: { ru: 'Подписки, пополнения баланса и донаты', en: 'Subscriptions, top-ups and donations' },
  purSubscription: { ru: 'Подписки', en: 'Subscriptions' }, purTopup: { ru: 'Пополнения', en: 'Top-ups' }, purDonation: { ru: 'Донаты', en: 'Donations' },
  asTable: { ru: 'Таблицей', en: 'As table' }, asChart: { ru: 'Диаграммой', en: 'As chart' },
  colDay: { ru: 'День', en: 'Day' }, colTotal: { ru: 'Итого', en: 'Total' },
  noData: { ru: 'За этот период данных нет', en: 'No data for this period' },

  tierTitle: { ru: 'Оборот по уровням Premium', en: 'Turnover by Premium tier' },
  tierDesc: { ru: 'Рубли через ЮKassa и покупки за BLM', en: 'Rubles via YooKassa and purchases with BLM' },
  tRevenue: { ru: 'Выручка', en: 'Revenue' }, tActive: { ru: 'Активных', en: 'Active' }, tMrr: { ru: 'MRR', en: 'MRR' },
  tPayments: { ru: 'Платежей', en: 'Payments' }, tNew: { ru: 'Новых подписчиков', en: 'New subscribers' },
  tRenewals: { ru: 'Автопродлений', en: 'Auto-renewals' }, tManual: { ru: 'Ручных оплат', en: 'Manual payments' },
  tMonth: { ru: 'Месячных', en: 'Monthly' }, tYear: { ru: 'Годовых', en: 'Yearly' },
  tWallet: { ru: 'Оплат с баланса', en: 'Paid with balance' }, tAutoOn: { ru: 'С автопродлением', en: 'Auto-renew on' },
  tGranted: { ru: 'Выдано админом', en: 'Granted by admin' }, tRefunded: { ru: 'Возвраты', en: 'Refunded' },

  subsTitle: { ru: 'Подписчики по дням', en: 'Subscribers by day' },
  subsDesc: { ru: 'По журналу смены тарифов, на конец суток', en: 'From the plan-change log, end of day' },
  arr: { ru: 'Годовой оборот (ARR)', en: 'Annual run rate (ARR)' },
  autoShare: { ru: 'Доля с автопродлением', en: 'Auto-renew share' },
  next7: { ru: 'Продлений в ближайшие 7 дней', en: 'Renewals in next 7 days' },
  churn7: { ru: 'Закончатся без автопродления (7 дней)', en: 'Expiring without auto-renew (7 days)' },
  people: { ru: 'чел.', en: 'users' },

  funnelTitle: { ru: 'Воронка оплаты', en: 'Payment funnel' },
  funnelDesc: { ru: 'Создано платёжных сессий и сколько дошло до оплаты', en: 'Payment sessions created and how many were paid' },
  fCreated: { ru: 'создано', en: 'created' }, fPaid: { ru: 'оплачено', en: 'paid' }, fAbandoned: { ru: 'брошено', en: 'abandoned' },
  fPending: { ru: 'в ожидании', en: 'pending' }, fConversion: { ru: 'конверсия', en: 'conversion' },
  purBinding: { ru: 'Привязка карты', en: 'Card binding' },

  renewTitle: { ru: 'Автопродление', en: 'Auto-renewal' },
  renewDesc: { ru: 'Автоматические списания за период', en: 'Automatic charges in the period' },
  rOk: { ru: 'Успешных', en: 'Succeeded' }, rFail: { ru: 'Неудачных', en: 'Failed' }, rPending: { ru: 'В обработке', en: 'Pending' },
  rRate: { ru: 'Успешность', en: 'Success rate' }, rReasons: { ru: 'Причины отказов', en: 'Failure reasons' },
  rNone: { ru: 'Автосписаний за период не было', en: 'No auto-charges in the period' },

  cardsTitle: { ru: 'Карты и способы оплаты', en: 'Cards & payment methods' },
  cardsDesc: { ru: 'Сохранённые способы, с которых можно списывать без участия пользователя', en: 'Saved methods that can be charged without the user' },
  cSaved: { ru: 'Привязано способов', en: 'Saved methods' }, cUsers: { ru: 'Пользователей с картой', en: 'Users with a method' },
  cNew: { ru: 'Привязано за период', en: 'Bound in period' }, cBindings: { ru: 'Привязок начато / завершено', en: 'Bindings started / done' },
  cRecent: { ru: 'Недавно привязали', en: 'Recently bound' },
  mType_bank_card: { ru: 'Банковская карта', en: 'Bank card' }, mType_yoo_money: { ru: 'ЮMoney', en: 'YooMoney' }, mType_sbp: { ru: 'СБП', en: 'SBP' },
  mType_tinkoff_bank: { ru: 'T-Pay', en: 'T-Pay' }, mType_sberbank: { ru: 'SberPay', en: 'SberPay' }, mType_unknown: { ru: 'Не определён', en: 'Unknown' },

  methodsTitle: { ru: 'Чем платят', en: 'How people pay' },
  methodsDesc: { ru: 'Способы оплаты по выручке за период', en: 'Payment methods by revenue in the period' },

  refundsTitle: { ru: 'Возвраты', en: 'Refunds' },
  refundsDesc: { ru: 'Полный возврат отзывает BLM, автопродление и значок спонсора', en: 'A full refund revokes BLM, auto-renew and the sponsor badge' },
  refRate: { ru: 'Доля возвратов', en: 'Refund rate' }, refPartial: { ru: 'Частичных возвратов (разобрать вручную)', en: 'Partial refunds (review manually)' },
  refNone: { ru: 'Возвратов нет', en: 'No refunds' },

  reviewTitle: { ru: 'Требуют разбора', en: 'Needs review' },
  reviewDesc: { ru: 'Деньги пришли, но что-то не сошлось. Зачесть — после проверки в кабинете ЮKassa.', en: 'Money arrived but something does not match. Approve only after checking the YooKassa dashboard.' },
  reviewNone: { ru: 'Всё чисто — разбирать нечего', en: 'All clear — nothing to review' },
  approve: { ru: 'Зачесть', en: 'Approve' }, reject: { ru: 'Отклонить', en: 'Reject' },
  confirmApprove: { ru: 'Зачесть платёж? ЮKassa подтвердит, что деньги пришли.', en: 'Approve this payment? YooKassa will confirm the money arrived.' },
  confirmReject: { ru: 'Отклонить без зачисления? Деньги нужно будет вернуть вручную в кабинете ЮKassa.', en: 'Reject without crediting? You will have to refund the money in the YooKassa dashboard.' },
  resolveFailed: { ru: 'Не удалось: ', en: 'Failed: ' },

  walletTitle: { ru: 'Кошелёк BLM', en: 'BLM wallet' },
  walletDesc: { ru: 'Баланс пользователей и движение за период (по журналу кошелька)', en: 'User balances and movement in the period (wallet ledger)' },
  wTotal: { ru: 'BLM на балансах', en: 'BLM in wallets' }, wHolders: { ru: 'Кошельков с балансом', en: 'Wallets with balance' },
  wMovement: { ru: 'Движение за период', en: 'Movement in period' }, wTop: { ru: 'Крупнейшие балансы', en: 'Largest balances' },
  wNone: { ru: 'Операций за период не было', en: 'No operations in the period' },
  kind_topup: { ru: 'Пополнение', en: 'Top-up' }, kind_subscription: { ru: 'Подписка', en: 'Subscription' },
  kind_sticker_purchase: { ru: 'Покупка стикерпака', en: 'Sticker pack purchase' }, kind_sticker_sale: { ru: 'Продажа стикерпака', en: 'Sticker pack sale' },
  kind_shop_purchase: { ru: 'Покупка в магазине', en: 'Shop purchase' }, kind_group_donation: { ru: 'Донат группе', en: 'Group donation' },
  kind_dev_topup: { ru: 'Тестовое пополнение', en: 'Test top-up' }, kind_refund_clawback: { ru: 'Списание при возврате', en: 'Refund clawback' },

  payersTitle: { ru: 'Лучшие плательщики', en: 'Top payers' }, payersDesc: { ru: 'За всё время, без возвратов', en: 'All time, excluding refunds' },
  sponsors: { ru: 'Спонсоров с значком', en: 'Sponsors with badge' }, payersAll: { ru: 'Платили когда-либо', en: 'Ever paid' },

  recentTitle: { ru: 'Недавние покупки', en: 'Recent purchases' }, recentDesc: { ru: 'Последние платежи: оплаченные, возвраты и на разборе', en: 'Latest payments: paid, refunded and under review' },
  recentNone: { ru: 'Платежей пока нет', en: 'No payments yet' },
  viaBalance: { ru: 'с баланса', en: 'from balance' }, auto: { ru: 'автопродление', en: 'auto-renew' },
  sMonth: { ru: 'мес.', en: 'mo.' }, sYear: { ru: 'год', en: 'year' },
  pur_wallet_topup: { ru: 'Пополнение', en: 'Top-up' }, pur_subscription: { ru: 'Подписка', en: 'Subscription' }, pur_donation: { ru: 'Донат', en: 'Donation' },
  st_succeeded: { ru: 'Оплачен', en: 'Paid' }, st_refunded: { ru: 'Возврат', en: 'Refunded' }, st_review: { ru: 'Разбор', en: 'Review' },
  st_pending: { ru: 'Ожидает', en: 'Pending' }, st_expired: { ru: 'Не оплачен', en: 'Not paid' },

  otherTitle: { ru: 'Пользователи и Dealers’ Den', en: 'Users & Dealers’ Den' },
} as const

export type FinanceKey = keyof typeof S

export function useFinanceT() {
  const lang = useLangStore()
  return (key: FinanceKey | (string & {})): string => {
    const row = (S as Record<string, { ru: string; en: string }>)[key]
    if (!row) return key
    return lang.currentLang === 'RU' ? row.ru : row.en
  }
}
