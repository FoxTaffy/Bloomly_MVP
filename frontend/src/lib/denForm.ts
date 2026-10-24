export const LISTING_CURRENCIES = ['USD', 'EUR', 'RUB', 'GBP', 'JPY', 'CNY'] as const

/** Поля анкеты комиссии: по одному на строку, звёздочка в конце — обязательное. */
export function parseFormFields(text: string) {
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => ({
    label: line.replace(/\*$/, '').trim(),
    required: line.endsWith('*'),
    type: 'text',
  })).filter(f => f.label)
}
