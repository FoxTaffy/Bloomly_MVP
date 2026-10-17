import axios from 'axios'
import { ref } from 'vue'

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

export function setupApiAuth(
  getToken: () => string | null,
  onUnauthorized: () => void,
  refreshToken: () => Promise<string | null | undefined>,
  onFrozen?: (reason: string) => void,
) {
  _getToken = getToken
  _onUnauthorized = onUnauthorized
  _refreshToken = refreshToken
  if (onFrozen) _onFrozen = onFrozen
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

// Flag to prevent multiple concurrent refresh attempts
let _isRefreshing = false
let _refreshQueue: Array<(token: string | null | undefined) => void> = []

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
    if (error.response?.status === 401 && hadAuthorization && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      if (_isRefreshing) {
        // Queue request until refresh finishes
        return new Promise((resolve, reject) => {
          _refreshQueue.push((newToken) => {
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
              resolve(api(originalRequest))
            } else {
              reject(error)
            }
          })
        })
      }

      originalRequest._retry = true
      _isRefreshing = true

      try {
        const newToken = await _refreshToken()
        _refreshQueue.forEach((cb) => cb(newToken))
        _refreshQueue = []
        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
          return api(originalRequest)
        } else if (newToken === null) {
          // Server confirmed the session is dead — this is a real logout.
          _onUnauthorized()
          return Promise.reject(error)
        } else {
          // Transient refresh failure (e.g. network blip) — session may still be
          // valid, so just fail this one request instead of kicking the user out.
          return Promise.reject(error)
        }
      } catch {
        _refreshQueue.forEach((cb) => cb(undefined))
        _refreshQueue = []
        return Promise.reject(error)
      } finally {
        _isRefreshing = false
      }
    }
    return Promise.reject(error)
  },
)

export default api
