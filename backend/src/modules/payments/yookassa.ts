import { yookassaConfig } from './config.js';
import { logger } from '../../lib/logger.js';

// ЮKassa API v3: https://yookassa.ru/developers/api
// Платёж создаём на сервере, пользователя уводим на confirmation_url (страница ЮKassa), итог приходит webhook'ом
// (payment.succeeded / payment.canceled). Webhook не подписан, поэтому ему не верим на слово:
// статус и сумму перечитываем из API по id платежа.

export type PayMethod = 'AC' | 'PC'; // AC — банковская карта, PC — кошелёк ЮMoney

const API = 'https://api.yookassa.ru/v3';

export interface YookassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: { value: string; currency: string };
  income_amount?: { value: string; currency: string };
  refunded_amount?: { value: string; currency: string };
  metadata?: Record<string, string>;
  cancellation_details?: { party?: string; reason?: string };
  confirmation?: { type: string; confirmation_url?: string };
  payment_method?: YookassaPaymentMethod;
}

/** Способ оплаты в платеже. saved = true — по id можно списывать без участия пользователя. */
export interface YookassaPaymentMethod {
  id: string;
  type: string; // bank_card | yoo_money | sbp | …
  saved: boolean;
  title?: string;
  account_number?: string;
  card?: { first6?: string; last4?: string; expiry_month?: string; expiry_year?: string; card_type?: string };
}

export interface YookassaNotification {
  type?: string;  // notification
  event?: string; // payment.succeeded | payment.canceled | payment.waiting_for_capture | …
  object?: { id?: string; payment_id?: string };
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, idempotenceKey?: string): Promise<T> {
  const { shopId, secretKey } = yookassaConfig();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error({ status: res.status, path, body: text.slice(0, 300) }, '[payments] yookassa request failed');
    throw Object.assign(new Error('PAYMENT_GATEWAY_ERROR'), { statusCode: 502, upstreamStatus: res.status });
  }
  return res.json() as Promise<T>;
}

function receiptOf(description: string, amount: number, customerEmail?: string) {
  const { receipt } = yookassaConfig();
  if (!receipt.enabled || !customerEmail) return {};
  return {
    receipt: {
      customer: { email: customerEmail },
      ...(receipt.taxSystemCode ? { tax_system_code: receipt.taxSystemCode } : {}),
      items: [{
        description: description.slice(0, 128),
        quantity: '1.00',
        amount: { value: amount.toFixed(2), currency: 'RUB' },
        vat_code: receipt.vatCode,
        payment_mode: 'full_payment',
        payment_subject: 'service',
      }],
    },
  };
}

/**
 * Создаёт платёж (capture сразу). Повтор с тем же paymentId вернёт тот же платёж.
 * savePaymentMethod — ЮKassa сохранит карту/кошелёк для автоплатежей (нужно включить автоплатежи в магазине).
 */
export function createYookassaPayment(opts: {
  paymentId: string;
  amount: number;
  description: string;
  returnUrl: string;
  customerEmail?: string;
  savePaymentMethod?: boolean;
}): Promise<YookassaPayment> {
  return call<YookassaPayment>('POST', '/payments', {
    ...receiptOf(opts.description, opts.amount, opts.customerEmail),
    amount: { value: opts.amount.toFixed(2), currency: 'RUB' },
    capture: true,
    // Способ оплаты (карта, ЮMoney, СБП…) пользователь выбирает на странице ЮKassa
    confirmation: { type: 'redirect', return_url: opts.returnUrl },
    ...(opts.savePaymentMethod ? { save_payment_method: true } : {}),
    description: opts.description.slice(0, 128),
    metadata: { payment_id: opts.paymentId },
  }, opts.paymentId);
}

/** Автоплатёж по сохранённому способу: без confirmation, пользователь не участвует. */
export function chargeSavedPaymentMethod(opts: {
  paymentId: string;
  paymentMethodId: string;
  amount: number;
  description: string;
  customerEmail?: string;
}): Promise<YookassaPayment> {
  return call<YookassaPayment>('POST', '/payments', {
    ...receiptOf(opts.description, opts.amount, opts.customerEmail),
    amount: { value: opts.amount.toFixed(2), currency: 'RUB' },
    capture: true,
    payment_method_id: opts.paymentMethodId,
    description: opts.description.slice(0, 128),
    metadata: { payment_id: opts.paymentId },
  }, opts.paymentId);
}

/** Полный возврат (проверочный платёж привязки карты). */
export function refundYookassaPayment(opts: { paymentId: string; remoteId: string; amount: number }) {
  return call<{ id: string; status: string }>('POST', '/refunds', {
    payment_id: opts.remoteId,
    amount: { value: opts.amount.toFixed(2), currency: 'RUB' },
  }, `refund-${opts.paymentId}`);
}

export function fetchYookassaPayment(id: string): Promise<YookassaPayment> {
  return call<YookassaPayment>('GET', `/payments/${encodeURIComponent(id)}`);
}
