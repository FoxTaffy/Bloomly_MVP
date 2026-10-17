import { isDevEnv } from '../../lib/env.js';

// Настройки ЮKassa (https://yookassa.ru/my → Интеграция → Ключи API).
// Пока YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY не заданы, оплата через шлюз выключена.
//   YOOKASSA_SHOP_ID    — идентификатор магазина
//   YOOKASSA_SECRET_KEY — секретный ключ (live_… / test_…)
//   PAYMENTS_RETURN_URL — куда вернуть после оплаты (по умолчанию FRONTEND_URL/payment/result)
export function yookassaConfig() {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim() || '';
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim() || '';
  const frontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
  return {
    shopId,
    secretKey,
    returnUrl: process.env.PAYMENTS_RETURN_URL?.trim() || `${frontend}/payment/result`,
    enabled: Boolean(shopId && secretKey),
    // Автоплатежи (привязка карты, автопродление) включает менеджер ЮKassa по заявке; до этого
    // платёж с save_payment_method отклоняется. После подключения: YOOKASSA_RECURRING=true
    recurring: Boolean(shopId && secretKey) && process.env.YOOKASSA_RECURRING === 'true',
    // Чеки 54-ФЗ (если в ЮKassa подключена онлайн-касса): YOOKASSA_RECEIPT=true
    //   YOOKASSA_VAT_CODE — ставка НДС (1 = без НДС, по умолчанию), YOOKASSA_TAX_SYSTEM_CODE — СНО (1–6, необязательно)
    receipt: {
      enabled: process.env.YOOKASSA_RECEIPT === 'true',
      vatCode: Number(process.env.YOOKASSA_VAT_CODE) || 1,
      taxSystemCode: Number(process.env.YOOKASSA_TAX_SYSTEM_CODE) || undefined,
    },
  };
}

/**
 * Имитация подтверждения платежа (POST /payments/:id/dev-confirm) — только в dev/test.
 * Позволяет прогнать весь сценарий до получения ключей ЮKassa.
 */
export const devPaymentsAllowed = () => isDevEnv();

export const TOPUP_MIN = 50;
/** Своя сумма пополнения — кратно минимальной. */
export const TOPUP_STEP = 50;
export const TOPUP_MAX = 15000;
/** Неоплаченный платёж через сутки помечается expired (если деньги всё же придут — зачтутся). */
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export const DONATE_MIN = 500;
export const DONATE_MAX = 50000;

/** Привязка карты без покупки: проверочный платёж, который сразу возвращаем. */
export const CARD_BINDING_AMOUNT = 1;

// Автопродление: первая попытка списания за сутки до конца периода, при неудаче — повтор раз в сутки.
// Пока попытки не исчерпаны, тариф не сбрасывается (RENEW_GRACE_MS после окончания периода).
export const RENEW_AHEAD_MS = 24 * 60 * 60 * 1000;
export const RENEW_RETRY_MS = 24 * 60 * 60 * 1000;
export const RENEW_MAX_ATTEMPTS = 3;
export const RENEW_GRACE_MS = 2 * 24 * 60 * 60 * 1000;
