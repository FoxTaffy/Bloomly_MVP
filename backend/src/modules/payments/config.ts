import { isDevEnv } from '../../lib/env.js';

// Настройки ЮMoney (кошелёк-получатель, приём через форму Quickpay + HTTP-уведомления).
// Пока YOOMONEY_RECEIVER и YOOMONEY_NOTIFICATION_SECRET не заданы, оплата через шлюз выключена.
//   YOOMONEY_RECEIVER            — номер кошелька ЮMoney (41001…)
//   YOOMONEY_NOTIFICATION_SECRET — «секрет» со страницы https://yoomoney.ru/transfer/myservices/http-notification
//   YOOMONEY_QUICKPAY_URL        — адрес формы (по умолчанию https://yoomoney.ru/quickpay/confirm)
//   PAYMENTS_RETURN_URL          — куда вернуть после оплаты (по умолчанию FRONTEND_URL/payment/result)
export function yoomoneyConfig() {
  const receiver = process.env.YOOMONEY_RECEIVER?.trim() || '';
  const secret = process.env.YOOMONEY_NOTIFICATION_SECRET?.trim() || '';
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return {
    receiver,
    secret,
    quickpayUrl: process.env.YOOMONEY_QUICKPAY_URL?.trim() || 'https://yoomoney.ru/quickpay/confirm',
    returnUrl: process.env.PAYMENTS_RETURN_URL?.trim() || `${frontend}/payment/result`,
    enabled: Boolean(receiver && secret),
  };
}

/**
 * Имитация подтверждения платежа (POST /payments/:id/dev-confirm) — только в dev/test.
 * Позволяет прогнать весь сценарий до получения ключей ЮMoney.
 */
export const devPaymentsAllowed = () => isDevEnv();

export const TOPUP_MIN = 50;
export const TOPUP_MAX = 15000;
/** Неоплаченный платёж через сутки помечается expired (если деньги всё же придут — зачтутся). */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;
