// Лимиты размера загрузок по тарифам для предпроверки на клиенте — чтобы не гнать гигабайты зря.
// Зеркало перков backend/src/modules/payments/plan-perks.ts (maxPhotoBytes / maxVideoBytes / maxAttachmentBytes /
// uncompressedPhotos); совпадение проверяет backend/test/upload-limits.test.ts. Решает всегда сервер.

const MB = 1024 * 1024
const GB = 1024 * MB

export type UploadTier = 'free' | 'lite' | 'pro' | 'business'
export type UploadKind = 'photo' | 'video' | 'document'

export interface FileLimits {
  maxPhotoBytes: number
  maxVideoBytes: number
  /** 0 — PSD и архивы тариф не принимает */
  maxAttachmentBytes: number
  uncompressedPhotos: boolean
}

export const FILE_LIMITS: Record<UploadTier, FileLimits> = {
  free:     { maxPhotoBytes: 15 * MB, maxVideoBytes: 100 * MB, maxAttachmentBytes: 0,    uncompressedPhotos: false },
  lite:     { maxPhotoBytes: 50 * MB, maxVideoBytes: 500 * MB, maxAttachmentBytes: 0,    uncompressedPhotos: true },
  pro:      { maxPhotoBytes: 50 * MB, maxVideoBytes: 1 * GB,   maxAttachmentBytes: 1 * GB, uncompressedPhotos: true },
  business: { maxPhotoBytes: 50 * MB, maxVideoBytes: 2 * GB,   maxAttachmentBytes: 2 * GB, uncompressedPhotos: true },
}

const TIER_ORDER: UploadTier[] = ['free', 'lite', 'pro', 'business']

export function normalizeTier(tier?: string | null): UploadTier {
  return (TIER_ORDER as string[]).includes(tier ?? '') ? (tier as UploadTier) : 'free'
}

/** Типы документов и исходников (PSD, архивы), которые принимает чат. */
export const DOCUMENT_TYPES = [
  'application/zip', 'application/x-7z-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
  'application/gzip', 'image/vnd.adobe.photoshop',
]
const DOCUMENT_EXT_TYPES: Record<string, string> = {
  zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
  gz: 'application/gzip', psd: 'image/vnd.adobe.photoshop',
}

/** Браузеры часто не знают тип PSD/архивов (пустой file.type): определяем по расширению. */
export function effectiveMime(file: { name: string; type: string }): string {
  if (file.type && file.type !== 'application/octet-stream' && file.type !== 'application/x-zip-compressed') return file.type
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return DOCUMENT_EXT_TYPES[ext] ?? (file.type === 'application/x-zip-compressed' ? 'application/zip' : file.type)
}

export function uploadKind(mime: string): UploadKind {
  if (mime.startsWith('image/') && mime !== 'image/vnd.adobe.photoshop') return 'photo'
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'video'
  return 'document'
}

export function limitBytes(tier: UploadTier, kind: UploadKind): number {
  const l = FILE_LIMITS[tier]
  return kind === 'photo' ? l.maxPhotoBytes : kind === 'video' ? l.maxVideoBytes : l.maxAttachmentBytes
}

/** Самый дешёвый тариф, на котором файл такого вида и размера проходит; null — не проходит нигде. */
export function requiredTier(kind: UploadKind, size: number): UploadTier | null {
  return TIER_ORDER.find(t => limitBytes(t, kind) > 0 && limitBytes(t, kind) >= size) ?? null
}

export function formatBytes(bytes: number): string {
  return bytes >= GB ? `${+(bytes / GB).toFixed(1)} ГБ` : `${Math.round(bytes / MB)} МБ`
}

export type UploadCheck =
  | { ok: true; kind: UploadKind }
  | { ok: false; kind: UploadKind; reason: 'too_big' | 'not_in_plan'; limit: number; needTier: UploadTier | null }

/**
 * Предпроверка файла по тарифу: влезает ли он. Папки вне тарифной сетки (аватары, баннеры…) сюда не передавать —
 * у них свои потолки, которые проверяет сервер.
 */
export function checkUpload(file: { name: string; type: string; size: number }, tier?: string | null): UploadCheck {
  const t = normalizeTier(tier)
  const kind = uploadKind(effectiveMime(file))
  const limit = limitBytes(t, kind)
  if (limit === 0) return { ok: false, kind, reason: 'not_in_plan', limit, needTier: requiredTier(kind, file.size) }
  if (file.size > limit) return { ok: false, kind, reason: 'too_big', limit, needTier: requiredTier(kind, file.size) }
  return { ok: true, kind }
}

export const TIER_NAME: Record<UploadTier, string> = { free: 'Free', lite: 'Lite', pro: 'Pro', business: 'Business' }
