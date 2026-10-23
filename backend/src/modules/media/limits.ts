import { Transform, type TransformCallback } from 'stream';
import { perksFor, type PerkTier } from '../payments/plan-perks.js';

// Лимиты размера загрузок по тарифам. Чистые функции без ввода-вывода: контроллер применяет их на лету,
// а тесты проверяют на уменьшенных значениях без многогигабайтных буферов.

export type UploadKind = 'photo' | 'video' | 'document';

/** Документы и исходники для вложений чата (PSD, архивы). Содержимое проверяется по сигнатуре. */
export const DOCUMENT_MIME_TYPES = new Set([
  'application/zip', 'application/x-7z-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
  'application/gzip', 'image/vnd.adobe.photoshop',
]);

export function uploadKind(mime: string): UploadKind {
  if (mime.startsWith('image/') && mime !== 'image/vnd.adobe.photoshop') return 'photo';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'video';
  return 'document';
}

/** Папки, где размер определяет тариф. Остальные (аватары, баннеры, стикеры…) имеют свои жёсткие потолки. */
export const TIER_GOVERNED_FOLDERS = new Set(['posts', 'comments', 'messages', 'backgrounds']);

export function tierLimitBytes(tier: string, kind: UploadKind): number {
  const p = perksFor(tier);
  return kind === 'photo' ? p.maxPhotoBytes : kind === 'video' ? p.maxVideoBytes : p.maxAttachmentBytes;
}

/** Внешний потолок тела запроса загрузки: самый большой лимит среди всех тарифов плюс запас на служебные части multipart. */
export const getMaxRequestBytes = () => Math.max(...(['free', 'lite', 'pro', 'business'] as const).map((t) => maxAnyBytes(t))) + 8 * 1024 * 1024;

/** Самый большой лимит тарифа среди всех видов файлов: грубая отсечка по Content-Length до разбора тела. */
export function maxAnyBytes(tier: string): number {
  const p = perksFor(tier);
  return Math.max(p.maxPhotoBytes, p.maxVideoBytes, p.maxAttachmentBytes);
}

/**
 * Лимит конкретного файла: по тарифу для папок с тарифными лимитами; в остальных — их собственный потолок
 * (`folderCap`), который тариф не повышает. 0 — такой тип файла тариф не принимает.
 */
export function limitFor(tier: string, kind: UploadKind, folder: string, folderCap?: number): number {
  if (TIER_GOVERNED_FOLDERS.has(folder)) return tierLimitBytes(tier, kind);
  return folderCap ?? tierLimitBytes(tier, kind);
}

const UPGRADE_ORDER: PerkTier[] = ['free', 'lite', 'pro', 'business'];

/** Самый дешёвый тариф, на котором файл такого размера и вида проходит; null — не проходит ни на каком. */
export function requiredTierFor(kind: UploadKind, sizeBytes: number): PerkTier | null {
  return UPGRADE_ORDER.find((t) => tierLimitBytes(t, kind) >= sizeBytes && tierLimitBytes(t, kind) > 0) ?? null;
}

/** Следующий тариф с большим лимитом для этого вида файла (подсказка «перейдите на …»), либо null. */
export function nextTierFor(tier: string, kind: UploadKind): PerkTier | null {
  const current = tierLimitBytes(tier, kind);
  return UPGRADE_ORDER.find((t) => tierLimitBytes(t, kind) > current) ?? null;
}

export class LimitExceeded extends Error {
  constructor(readonly limitBytes: number, readonly receivedBytes: number) { super('LIMIT_EXCEEDED'); }
}

/**
 * Считает байты и обрывает поток, как только набралось больше лимита: до диска лишнее не доходит,
 * дальше pipeline сам останавливает запись и закрывает приём.
 */
export class ByteLimiter extends Transform {
  received = 0;
  constructor(private readonly limitBytes: number, private readonly onChunk?: () => void) { super(); }
  _transform(chunk: Buffer, _enc: BufferEncoding, cb: TransformCallback) {
    this.received += chunk.length;
    this.onChunk?.();
    if (this.received > this.limitBytes) return cb(new LimitExceeded(this.limitBytes, this.received));
    cb(null, chunk);
  }
}

export const formatBytes = (bytes: number) => {
  const GB = 1024 ** 3;
  return bytes >= GB ? `${+(bytes / GB).toFixed(1)} ГБ` : `${Math.round(bytes / 1024 ** 2)} МБ`;
};

