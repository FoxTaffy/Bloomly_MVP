import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
import { apiErrorCode, apiErrorDetails } from '@/lib/apiError'
import { checkUpload, formatBytes, FILE_LIMITS, TIER_NAME, normalizeTier, type UploadKind, type UploadTier } from '@/lib/uploadLimits'

const isTier = (v: unknown): v is UploadTier => typeof v === 'string' && v in TIER_NAME

/**
 * Предпроверка размера файла по тарифу до отправки и разбор ответа сервера об превышении лимита.
 * Сообщение называет лимит и тариф, на котором файл пройдёт.
 */
export function useUploadPrecheck() {
  const auth = useAuthStore()
  const lang = useLangStore()

  const tier = () => normalizeTier(auth.user?.subscription_tier)

  function message(kind: UploadKind, reason: 'too_big' | 'not_in_plan', limit: number, needTier: UploadTier | null): string {
    const t = lang.t
    const base = reason === 'not_in_plan'
      ? t.uploadErrNoDocs
      : (kind === 'photo' ? t.uploadErrPhoto : kind === 'video' ? t.uploadErrVideo : t.uploadErrDocument).replace('{limit}', formatBytes(limit))
    const upgrade = needTier && needTier !== tier() ? `. ${t.uploadUpgradeTo.replace('{tier}', TIER_NAME[needTier])}` : ''
    return `${base}${upgrade}`
  }

  /** Текст ошибки, если файл не пройдёт по тарифу; null — можно отправлять. */
  function precheck(file: { name: string; type: string; size: number }): string | null {
    const r = checkUpload(file, auth.user?.subscription_tier)
    return r.ok ? null : message(r.kind, r.reason, r.limit, r.needTier)
  }

  /** Текст по ответу сервера (413 FILE_LIMIT_EXCEEDED / 403 FILE_TYPE_NOT_IN_PLAN); undefined — это не лимит. */
  function fromServerError(err: unknown): string | undefined {
    const code = apiErrorCode(err)
    if (code !== 'FILE_LIMIT_EXCEEDED' && code !== 'FILE_TYPE_NOT_IN_PLAN') return undefined
    const d = apiErrorDetails<{ kind?: UploadKind; limitBytes?: number; requiredTier?: string | null }>(err)
    if (!d?.kind) return undefined
    return message(d.kind, code === 'FILE_TYPE_NOT_IN_PLAN' ? 'not_in_plan' : 'too_big', d.limitBytes ?? 0, isTier(d.requiredTier) ? d.requiredTier : null)
  }

  /** Lite+ загружают фото «как есть» (без пережатия в браузере) — оригинал сохраняется на сервере. */
  const uncompressedPhotos = () => FILE_LIMITS[tier()].uncompressedPhotos

  return { precheck, fromServerError, uncompressedPhotos }
}
