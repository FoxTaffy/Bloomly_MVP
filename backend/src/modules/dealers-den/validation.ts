// Input validation for listing create/update. Bodies used to be cast to types without any
// checks, so bad values reached Postgres and came back as 500s (or junk rows were stored).
import type { ListingKind } from './types.js';

export const LISTING_CATEGORIES = ['art', 'fursuit', 'badge', 'print', 'music', 'craft', 'merch', 'other'] as const;
export const LISTING_TYPES = ['digital', 'physical', 'both'] as const;
export const LISTING_KINDS: readonly ListingKind[] = ['fixed', 'auction', 'ych', 'raffle', 'commission_queue'];
export const LISTING_CURRENCIES = ['USD', 'EUR', 'RUB', 'GBP', 'JPY', 'CNY'] as const;
const CREATE_STATUSES = ['active', 'draft'] as const;
const UPDATE_STATUSES = ['active', 'draft', 'sold', 'archived'] as const;

const MAX_MONEY = 9_999_999_999; // Decimal(12,2) upper bound, minus cents headroom
const MAX_QUANTITY = 10_000;
const MAX_IMAGES = 20;
const MAX_TAGS = 10;
const MAX_FORM_FIELDS = 10;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const inRange = (v: unknown, min: number, max: number) => isNum(v) && v >= min && v <= max;

/**
 * Returns a user-facing error message, or null when the input is acceptable.
 * In 'update' mode only the fields that are present are checked.
 */
export function validateListingInput(input: Record<string, any>, mode: 'create' | 'update'): string | null {
  const isCreate = mode === 'create';
  const has = (k: string) => input[k] !== undefined;

  if (isCreate || has('title')) {
    if (typeof input.title !== 'string' || input.title.trim().length < 1 || input.title.trim().length > 200) {
      return 'Название: от 1 до 200 символов';
    }
  }
  if (has('description') && input.description !== null &&
      (typeof input.description !== 'string' || input.description.length > 5000)) {
    return 'Описание: не длиннее 5000 символов';
  }
  if (isCreate || has('price')) {
    if (!inRange(input.price, 0, MAX_MONEY)) return 'Цена: неотрицательное число';
  }
  if (has('discountPercent') && !(isInt(input.discountPercent) && input.discountPercent >= 0 && input.discountPercent <= 90)) {
    return 'Скидка: целое число от 0 до 90 %';
  }
  if (has('currency') && !(LISTING_CURRENCIES as readonly string[]).includes(input.currency)) {
    return 'Неизвестная валюта';
  }
  if (has('category') && !(LISTING_CATEGORIES as readonly string[]).includes(input.category)) {
    return 'Неизвестная категория';
  }
  if (has('type') && !(LISTING_TYPES as readonly string[]).includes(input.type)) {
    return 'Неизвестный тип товара';
  }
  if (has('quantity') && !(isInt(input.quantity) && input.quantity >= 1 && input.quantity <= MAX_QUANTITY)) {
    return `Количество: целое число от 1 до ${MAX_QUANTITY}`;
  }
  if (has('isNsfw') && typeof input.isNsfw !== 'boolean') return 'Поле NSFW должно быть логическим';
  if (has('images') && (!Array.isArray(input.images) || input.images.length > MAX_IMAGES ||
      input.images.some((u: unknown) => typeof u !== 'string'))) {
    return `Фото: не более ${MAX_IMAGES}`;
  }
  if (has('tags') && (!Array.isArray(input.tags) || input.tags.length > MAX_TAGS ||
      input.tags.some((t: unknown) => typeof t !== 'string' || t.trim().length < 1 || t.trim().length > 40))) {
    return `Теги: не более ${MAX_TAGS}, каждый от 1 до 40 символов`;
  }
  if (has('status') && !(isCreate ? CREATE_STATUSES : UPDATE_STATUSES).includes(input.status)) {
    return 'Недопустимый статус объявления';
  }

  const kind: ListingKind = isCreate ? (input.listingKind ?? 'fixed') : 'fixed';
  if (isCreate && !LISTING_KINDS.includes(kind)) return 'Неизвестный вид объявления';

  if (isCreate && (kind === 'auction' || kind === 'ych') && !input.auctionEndsAt) {
    return 'Укажите дату окончания торгов';
  }
  if (has('auctionEndsAt') && input.auctionEndsAt !== null) {
    const ends = new Date(input.auctionEndsAt);
    if (Number.isNaN(ends.getTime()) || ends.getTime() <= Date.now()) {
      return 'Дата окончания торгов должна быть в будущем';
    }
  }
  if (has('bidIncrement') && !inRange(input.bidIncrement, 0.01, MAX_MONEY)) {
    return 'Шаг ставки должен быть больше нуля';
  }
  if (isCreate && input.autoBuyPrice != null) {
    if (!inRange(input.autoBuyPrice, 0, MAX_MONEY)) return 'Цена автовыкупа: неотрицательное число';
    if (input.autoBuyPrice < input.price) return 'Цена автовыкупа не может быть ниже стартовой цены';
  }
  if (isCreate && input.raffleMaxTickets != null && !(isInt(input.raffleMaxTickets) && input.raffleMaxTickets >= 1)) {
    return 'Лимит билетов: целое число не меньше 1';
  }
  if (isCreate && kind === 'commission_queue' && !(isInt(input.commissionSlotsTotal) && input.commissionSlotsTotal >= 1 && input.commissionSlotsTotal <= 1000)) {
    return 'Количество слотов: целое число от 1 до 1000';
  }
  if (has('commissionSlotsTotal') && input.commissionSlotsTotal !== null &&
      !(isInt(input.commissionSlotsTotal) && input.commissionSlotsTotal >= 1 && input.commissionSlotsTotal <= 1000)) {
    return 'Количество слотов: целое число от 1 до 1000';
  }
  if ((has('commissionEtaDays') && input.commissionEtaDays !== null) &&
      !(isInt(input.commissionEtaDays) && input.commissionEtaDays >= 0 && input.commissionEtaDays <= 365)) {
    return 'Срок выполнения: от 0 до 365 дней';
  }
  if (has('commissionFormFields') && input.commissionFormFields !== null) {
    const fields = input.commissionFormFields;
    const ok = Array.isArray(fields) && fields.length <= MAX_FORM_FIELDS && fields.every((f: any) =>
      f && typeof f.label === 'string' && f.label.trim().length >= 1 && f.label.length <= 100 &&
      typeof f.required === 'boolean' && (f.type === 'text' || f.type === 'textarea'));
    if (!ok) return `Поля формы: не более ${MAX_FORM_FIELDS}, у каждого название и тип text/textarea`;
  }
  if (has('commissionDetails') && input.commissionDetails !== null) {
    const d: any = input.commissionDetails;
    const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length >= 1 && v.length <= max;
    const price = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1_000_000;
    const list = (v: unknown, max: number) => v === undefined || (Array.isArray(v) && v.length <= max && v.every(x => str(x, 40)));
    const ok = d && typeof d === 'object' && !Array.isArray(d) &&
      (d.formats === undefined || (Array.isArray(d.formats) && d.formats.length <= 8 && d.formats.every((f: any) => f && str(f.name, 40) && price(f.price)))) &&
      (d.addons === undefined || (Array.isArray(d.addons) && d.addons.length <= 12 && d.addons.every((a: any) => a && str(a.name, 60) && price(a.price) && (a.hint === undefined || (typeof a.hint === 'string' && a.hint.length <= 120))))) &&
      list(d.draws, 20) && list(d.doesntDraw, 20) &&
      (d.sections === undefined || (Array.isArray(d.sections) && d.sections.length <= 4 && d.sections.every((sec: any) =>
        sec && str(sec.title, 40) && Array.isArray(sec.items) && sec.items.length <= 12 &&
        sec.items.every((it: any) => it && str(it.label, 40) && str(it.value, 80))))) &&
      (d.terms === undefined || (d.terms && typeof d.terms === 'object' && ['revisions', 'file', 'rights', 'refund', 'languages']
        .every(k => d.terms[k] === undefined || (typeof d.terms[k] === 'string' && d.terms[k].length <= 80))));
    if (!ok) return 'Детали комиссии: неверный формат (форматы, допы, «рисую / не рисую», условия)';
  }
  return null;
}
