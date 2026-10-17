import { yookassaConfig } from './config.js';
import { logger } from '../../lib/logger.js';

// ЮKassa API v3: https://yookassa.ru/developers/api
// Платёж создаём на сервере, пользователя уводим на confirmation_url, итог приходит webhook'ом
// (payment.succeeded / payment.canceled). Webhook не подписан, поэтому ему не верим на слово:
// статус и сумму перечитываем из API по id платежа.

export type PayMethod = 'AC' | 'PC'; // AC — банковская карта, PC — кошелёк ЮMoney

const API = 'https://api.yookassa.ru/v3';

const METHOD_TYPE: Record<PayMethod, string> = { AC: 'bank_card', PC: 'yoo_money' };

export interface YookassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  paid: boolean;
  amount: { value: string; currency: string };
  income_amount?: { value: string; currency: string };
  metadata?: Record<string, string>;
  cancellation_details?: { party?: string; reason?: string };
  confirmation?: { type: string; confirmation_url?: string };
}

export interface YookassaNotification {
  type?: string;  // notification
  event?: string; // payment.succeeded | payment.canceled | payment.waiting_for_capture | …
  object?: { id?: string };
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
    throw Object.assign(new Error('PAYMENT_GATEWAY_ERROR'), { statusCode: 502 });
  }
  return res.json() as Promise<T>;
}

/** Создаёт платёж (capture сразу). Повтор с тем же paymentId вернёт тот же платёж. */
export function createYookassaPayment(opts: {
  paymentId: string;
  amount: number;
  method: PayMethod;
  description: string;
  returnUrl: string;
  customerEmail?: string;
}): Promise<YookassaPayment> {
  const { receipt } = yookassaConfig();
  return call<YookassaPayment>('POST', '/payments', {
    ...(receipt.enabled && opts.customerEmail ? {
      receipt: {
        customer: { email: opts.customerEmail },
        ...(receipt.taxSystemCode ? { tax_system_code: receipt.taxSystemCode } : {}),
        items: [{
          description: opts.description.slice(0, 128),
          quantity: '1.00',
          amount: { value: opts.amount.toFixed(2), currency: 'RUB' },
          vat_code: receipt.vatCode,
          payment_mode: 'full_payment',
          payment_subject: 'service',
        }],
      },
    } : {}),
    amount: { value: opts.amount.toFixed(2), currency: 'RUB' },
    capture: true,
    payment_method_data: { type: METHOD_TYPE[opts.method] },
    confirmation: { type: 'redirect', return_url: opts.returnUrl },
    description: opts.description.slice(0, 128),
    metadata: { payment_id: opts.paymentId },
  }, opts.paymentId);
}

export function fetchYookassaPayment(id: string): Promise<YookassaPayment> {
  return call<YookassaPayment>('GET', `/payments/${encodeURIComponent(id)}`);
}
