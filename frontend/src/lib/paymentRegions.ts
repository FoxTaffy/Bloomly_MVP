export interface PaymentRegion {
  id: string
  label: string
}

/** Лейбл региона на языке интерфейса: страны — через Intl.DisplayNames, «Другое» — из словаря. */
export function regionLabel(id: string, locale: string, otherLabel: string): string {
  if (id === 'GLOBAL') return otherLabel
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(id) ?? id
  } catch {
    return id
  }
}

/** Код флага (flag-icons), валюта и её символ для карточки региона. */
export const REGION_VISUAL: Record<string, { flag: string | null; currency: string; symbol: string; color: string }> = {
  RU:     { flag: 'ru', currency: 'RUB', symbol: '₽',  color: '#e14664' },
  US:     { flag: 'us', currency: 'USD', symbol: '$',  color: '#66c770' },
  EU:     { flag: 'eu', currency: 'EUR', symbol: '€',  color: '#4c67cf' },
  CN:     { flag: 'cn', currency: 'CNY', symbol: '¥',  color: '#ffc01f' },
  IN:     { flag: 'in', currency: 'INR', symbol: '₹',  color: '#e76f51' },
  BR:     { flag: 'br', currency: 'BRL', symbol: 'R$', color: '#2fb36b' },
  GLOBAL: { flag: null, currency: '',    symbol: '🌐', color: '#a1b4ff' },
}

/** Валюты регионов оплаты из настроек (без «Другое») — для цен тарифов поддержки. */
export const SUPPORT_CURRENCIES: { code: string; symbol: string }[] = [...new Map(
  Object.values(REGION_VISUAL).filter(v => v.currency).map(v => [v.currency, { code: v.currency, symbol: v.symbol }]),
).values()]

export const PAYMENT_REGIONS: PaymentRegion[] = [
  { id: 'RU',     label: 'Россия / Russia' },
  { id: 'US',     label: 'США / United States' },
  { id: 'EU',     label: 'Европа / European Union' },
  { id: 'CN',     label: 'Китай / China' },
  { id: 'IN',     label: 'Индия / India' },
  { id: 'BR',     label: 'Бразилия / Brazil' },
  { id: 'GLOBAL', label: 'Другое / Global' },
]

export interface AltPaymentMethod {
  id: string
  label: string
  icon: string
}

const REGION_ALT_METHODS: Record<string, AltPaymentMethod[]> = {
  RU:     [{ id: 'sbp',    label: 'СБП',        icon: 'Landmark' }, { id: 'yandexpay', label: 'YandexPay', icon: 'Wallet' }],
  US:     [{ id: 'paypal', label: 'PayPal',     icon: 'Wallet' }, { id: 'crypto', label: 'Bitcoin', icon: 'Bitcoin' }],
  EU:     [{ id: 'paypal', label: 'PayPal',     icon: 'Wallet' }, { id: 'sepa',   label: 'SEPA',    icon: 'Landmark' }],
  CN:     [{ id: 'alipay', label: 'Alipay',     icon: 'Smartphone' }, { id: 'wechat', label: 'WeChat Pay', icon: 'MessageCircle' }],
  IN:     [{ id: 'upi',    label: 'UPI',        icon: 'Smartphone' }],
  BR:     [{ id: 'pix',    label: 'Pix',        icon: 'Zap' }],
  GLOBAL: [{ id: 'paypal', label: 'PayPal',     icon: 'Wallet' }, { id: 'crypto', label: 'Bitcoin', icon: 'Bitcoin' }],
}

export function altMethodsForRegion(region?: string | null): AltPaymentMethod[] {
  return REGION_ALT_METHODS[region || 'GLOBAL'] ?? REGION_ALT_METHODS.GLOBAL
}

// ── Which card networks are usable per region ──────────────────────────────────
// e.g. Russia: only Mir works on Russian-issued cards domestically; crypto is
// deliberately absent from REGION_ALT_METHODS.RU above for the same reason.
export const REGION_CARD_BRANDS: Record<string, string[]> = {
  RU:     ['mir'],
  US:     ['visa', 'mastercard'],
  EU:     ['visa', 'mastercard'],
  CN:     ['visa', 'mastercard'],
  IN:     ['visa', 'mastercard'],
  BR:     ['visa', 'mastercard'],
  GLOBAL: ['visa', 'mastercard', 'mir'],
}

export function allowedCardBrandsForRegion(region?: string | null): string[] {
  return REGION_CARD_BRANDS[region || 'GLOBAL'] ?? REGION_CARD_BRANDS.GLOBAL
}
