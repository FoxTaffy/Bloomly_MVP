import { isAxiosError } from 'axios'

// Our API reports failures as `{ success: false, error: { code, message } }`.

/** `error.message` from an API error response, if the request reached the API. */
export function apiErrorMessage(e: unknown): string | undefined {
  if (!isAxiosError(e)) return undefined
  const err = e.response?.data?.error
  // Часть модулей отвечает { error: { message } }, часть — плоской строкой { error: 'текст' }
  return typeof err === 'string' ? err : err?.message
}

/** HTTP status of a failed API request, if there was a response. */
export function apiErrorStatus(e: unknown): number | undefined {
  return isAxiosError(e) ? e.response?.status : undefined
}

/** `error.code` from an API error response (e.g. 'EMAIL_TAKEN'). */
export function apiErrorCode(e: unknown): string | undefined {
  return isAxiosError(e) ? e.response?.data?.error?.code : undefined
}

/** `error.details` from an API error response (extra context, e.g. how much money is missing). */
export function apiErrorDetails<T = Record<string, unknown>>(e: unknown): T | undefined {
  return isAxiosError(e) ? e.response?.data?.error?.details : undefined
}

/** `message` of a thrown Error (network failures, JS errors); undefined for anything else. */
export function errorMessage(e: unknown): string | undefined {
  return e instanceof Error ? e.message : undefined
}
