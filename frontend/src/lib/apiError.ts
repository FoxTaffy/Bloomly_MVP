import { isAxiosError } from 'axios'

// Our API reports failures as `{ success: false, error: { code, message } }`.

/** `error.message` from an API error response, if the request reached the API. */
export function apiErrorMessage(e: unknown): string | undefined {
  return isAxiosError(e) ? e.response?.data?.error?.message : undefined
}

/** HTTP status of a failed API request, if there was a response. */
export function apiErrorStatus(e: unknown): number | undefined {
  return isAxiosError(e) ? e.response?.status : undefined
}
