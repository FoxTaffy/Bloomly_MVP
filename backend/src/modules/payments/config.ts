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

export const DONATE_MIN = 30;
export const DONATE_MAX = 50000;
