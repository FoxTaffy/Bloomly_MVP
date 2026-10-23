import axios from 'axios'
import { ref } from 'vue'
import { singleFlight } from '@/lib/sessionRefresh'

// Flipped on by the backend's global maintenance-mode gate (every non-auth,
// non-admin route 503s while it's on) — MaintenanceOverlay.vue watches this
// to block the UI; cleared as soon as any request succeeds again.
export const maintenanceActive = ref(false)

// Callbacks injected by stores/auth to avoid a circular dependency:
//   api.ts → stores/auth → api.ts
let _getToken: () => string | null = () => null
let _onUnauthorized: () => void = () => {}
// Returns: new token on success · null if the session is confirmedly dead (logout) ·
// undefined if the refresh merely failed transiently (e.g. network blip) and the
// session may still be alive — don't force a logout for that.
let _refreshToken: () => Promise<string | null | undefined> = async () => null
// Called when the backend reports the account got frozen (mid-session, on any
// authenticated request) — kicks the user out to the main menu instead of just
// silently failing whatever action they were doing.
let _onFrozen: (reason: string) => void = () => {}
// True while a cached session is waiting for a transiently failed refresh to be retried.
let _hasPendingSession: () => boolean = () => false

export function setupApiAuth(
  getToken: () => string | null,
  onUnauthorized: () => void,
  refreshToken: () => Promise<string | null | undefined>,
  onFrozen?: (reason: string) => void,
  hasPendingSession?: () => boolean,
) {
  _getToken = getToken
  _onUnauthorized = onUnauthorized
  _refreshToken = refreshToken
  if (onFrozen) _onFrozen = onFrozen
  if (hasPendingSession) _hasPendingSession = hasPendingSession
}

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send httpOnly refresh_token cookie on every request
})

api.interceptors.request.use(
  (config) => {
    const token = _getToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error),
)

// Single-flight: all requests that hit a 401 at once await one shared refresh.
// _onUnauthorized fires inside it, exactly once, and only when the refresh was
// explicitly rejected (null) — never for network errors / 5xx (undefined).
const refreshShared = singleFlight(async (): Promise<string | null | undefined> => {
  try {
    const newToken = await _refreshToken()
    if (newToken === null) _onUnauthorized()
    return newToken
  } catch {
    return undefined
  }
})

api.interceptors.response.use(
  (response) => {
    maintenanceActive.value = false
    return response
  },
  async (error) => {
    if (error.response?.status === 503 && error.response?.data?.error?.code === 'MAINTENANCE') {
      maintenanceActive.value = true
      return Promise.reject(error)
    }
    if (error.response?.status === 403 && error.response?.data?.error?.code === 'ACCOUNT_FROZEN') {
      _onFrozen(error.response?.data?.error?.message || '')
      return Promise.reject(error)
    }
    const originalRequest = error.config
    const hadAuthorization = Boolean(originalRequest?.headers?.Authorization || originalRequest?.headers?.authorization)
    if (
      error.response?.status === 401 && originalRequest && !originalRequest._retry &&
      (hadAuthorization || _hasPendingSession()) && !originalRequest.url?.includes('/auth/refresh')
    ) {
      originalRequest._retry = true
      // Another request may have refreshed already: retry with the current token, no new refresh.
      const current = _getToken()
      const sent = String(originalRequest.headers?.Authorization ?? originalRequest.headers?.authorization ?? '')
      const newToken = current && sent !== `Bearer ${current}` ? current : await refreshShared()
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      }
      // null → logout already triggered by refreshShared; undefined → transient, keep the session.
    }
    return Promise.reject(error)
  },
)

export default api
