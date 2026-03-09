import axios from 'axios'

// Callbacks injected by stores/auth to avoid a circular dependency:
//   api.ts → stores/auth → api.ts
let _getToken: () => string | null = () => null
let _onUnauthorized: () => void = () => {}
let _refreshToken: () => Promise<string | null> = async () => null

export function setupApiAuth(
  getToken: () => string | null,
  onUnauthorized: () => void,
  refreshToken: () => Promise<string | null>,
) {
  _getToken = getToken
  _onUnauthorized = onUnauthorized
  _refreshToken = refreshToken
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
let _refreshQueue: Array<(token: string | null) => void> = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
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
        } else {
          _onUnauthorized()
          return Promise.reject(error)
        }
      } catch {
        _refreshQueue.forEach((cb) => cb(null))
        _refreshQueue = []
        _onUnauthorized()
        return Promise.reject(error)
      } finally {
        _isRefreshing = false
      }
    }
    return Promise.reject(error)
  },
)

export default api
