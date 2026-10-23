// Helpers for refreshing the access token without logging the user out by mistake.

/** Wraps an async fn so concurrent callers share one in-flight promise (single-flight / mutex). */
export function singleFlight<A extends unknown[], T>(fn: (...args: A) => Promise<T>): (...args: A) => Promise<T> {
  let inFlight: Promise<T> | null = null
  return (...args) => {
    if (!inFlight) {
      inFlight = fn(...args).finally(() => { inFlight = null })
    }
    return inFlight
  }
}

/**
 * Whether a failed /auth/refresh means the session is really dead. Only an explicit
 * 401/403 from the endpoint counts; timeouts, no network and 5xx (502/503/504) are transient.
 */
export function isRefreshRejected(status: number | undefined): boolean {
  return status === 401 || status === 403
}
