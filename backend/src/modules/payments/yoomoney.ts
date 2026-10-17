import { createHash, timingSafeEqual } from 'crypto';

// Протокол ЮMoney для кошельков: форма Quickpay + HTTP-уведомления о входящих переводах.
// https://yoomoney.ru/docs/payment-buttons/using-api/forms
// https://yoomoney.ru/docs/wallet/using-api/notification-p2p-incoming

export type YoomoneyMethod = 'AC' | 'PC'; // AC — банковская карта, PC — кошелёк ЮMoney

export function buildQuickpayUrl(opts: {
  baseUrl: string;
  receiver: string;
  amount: number;
  label: string;
  method: YoomoneyMethod;
  description: string;
  successUrl: string;
}): string {
  const params = new URLSearchParams({
    receiver: opts.receiver,
    'quickpay-form': 'button',
    paymentType: opts.method,
    sum: opts.amount.toFixed(2),
    label: opts.label,
    targets: opts.description,
    formcomment: 'Bloomly',
    'short-dest': opts.description,
    successURL: opts.successUrl,
  });
  return `${opts.baseUrl}?${params.toString()}`;
}

/** Поля уведомления (application/x-www-form-urlencoded). Всё приходит строками. */
export interface YoomoneyNotification {
  notification_type?: string; // p2p-incoming | card-incoming
  operation_id?: string;
  amount?: string;            // зачислено получателю (после комиссии)
  withdraw_amount?: string;   // списано с плательщика
  currency?: string;          // 643
  datetime?: string;
  sender?: string;
  codepro?: string;
  label?: string;
  sha1_hash?: string;
  unaccepted?: string;
  test_notification?: string;
}

/** sha1(notification_type&operation_id&amount&currency&datetime&sender&codepro&secret&label) */
export function verifyNotification(n: YoomoneyNotification, secret: string): boolean {
  if (!n.sha1_hash || !secret) return false;
  const str = [
    n.notification_type, n.operation_id, n.amount, n.currency, n.datetime,
    n.sender, n.codepro, secret, n.label,
  ].map((v) => v ?? '').join('&');
  const expected = Buffer.from(createHash('sha1').update(str, 'utf8').digest('hex'));
  const got = Buffer.from(String(n.sha1_hash).toLowerCase());
  return expected.length === got.length && timingSafeEqual(expected, got);
}
