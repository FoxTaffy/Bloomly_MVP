import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { setupApiAuth } from '../api'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string
  username: string
  email: string
  role: string
  display_name?: string | null
  avatar_url?: string | null
  bio?: string | null
  status?: string | null
  subscription_tier?: string
  profile_theme?: string | null
  profile_bg_url?: string | null
  profile_frame?: string | null
  email_verified?: boolean
  is_verified?: boolean
  onboarding_done?: boolean
  payment_region?: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// User profile cached in sessionStorage for faster display on reload (NOT for auth)
function loadUser(): User | null {
  try {
    const raw = sessionStorage.getItem('auth_user')
    return JSON.parse(raw ?? 'null')
  } catch {
    return null
  }
}

function saveUser(u: User) {
  sessionStorage.setItem('auth_user', JSON.stringify(u))
}

function clearUser() {
  sessionStorage.removeItem('auth_user')
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAuthStore = defineStore('auth', () => {
  // ── State ────────────────────────────────────────────────────────────────
  // Access token lives ONLY in memory — never written to localStorage
  const token         = ref<string | null>(null)
  const user          = ref<User | null>(loadUser())
  const isLoading     = ref(false)
  const isInitialized = ref(false)
  const error         = ref<string | null>(null)

  // ── Getters ──────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const displayName     = computed(() => user.value?.display_name || user.value?.username || 'User')
  const avatarUrl       = computed(() => user.value?.avatar_url ?? '')

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Restore session on page load by using the httpOnly refresh_token cookie */
  async function tryRefresh(): Promise<boolean> {
    try {
      const res = await api.post('/auth/refresh')
      if (res.data.success) {
        token.value = res.data.data.token
        user.value  = res.data.data.user
        saveUser(res.data.data.user)
        return true
      }
    } catch {
      clearUser()
      user.value = null
    }
    return false
  }

  async function login(email: string, password: string, remember = false): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/login', { email, password, remember })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Invalid email or password')
      token.value = data.data.token
      user.value  = data.data.user
      saveUser(data.data.user)
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function register(email: string, username: string, password: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/register', { email, username, password })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Registration failed')
      // НЕ логиним автоматически — ждём подтверждения OTP
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      isLoading.value = false
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function verifyEmail(email: string, code: string, remember = false): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/verify-email', { email, code, remember })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Verification failed')
      token.value = data.data.token
      user.value  = data.data.user
      saveUser(data.data.user)
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function resendOtp(email: string, purpose: 'register' | 'reset'): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      await api.post('/auth/resend-otp', { email, purpose })
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /** Вход через токен (после OAuth redirect) */
  function loginWithToken(jwtToken: string, savedUser: User, _remember = true): void {
    token.value = jwtToken
    user.value  = savedUser
    saveUser(savedUser)
  }

  async function forgotPassword(email: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      await api.post('/auth/forgot-password', { email })
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/reset-password', { email, code, password: newPassword })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Reset failed')
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function changePassword(newPassword: string, currentPassword?: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/change-password', { currentPassword, newPassword })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Change password failed')
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function fetchMe(): Promise<void> {
    if (!token.value) return
    try {
      const res = await api.get('/auth/me')
      const data = res.data
      if (data.success) {
        user.value = data.data.user
        saveUser(data.data.user)
      }
    } catch (e: any) {
      if (e?.response?.status === 401) logout()
    }
  }

  async function logout(): Promise<void> {
    try { await api.post('/auth/logout') } catch { /* best-effort */ }
    token.value = null
    user.value = null
    clearUser()
  }

  // Wire up axios interceptors — no circular dep since api.ts no longer imports stores
  setupApiAuth(
    () => token.value,
    async () => {
      await logout()
      const { default: router } = await import('../router')
      router.push({ name: 'login' })
    },
    async () => {
      const ok = await tryRefresh()
      return ok ? token.value : null
    },
  )

  // Restore session via httpOnly refresh_token cookie on page load
  tryRefresh().finally(() => { isInitialized.value = true })

  return {
    token, user, isLoading, isInitialized, error,
    isAuthenticated, displayName, avatarUrl,
    login, register, verifyEmail, resendOtp, loginWithToken,
    forgotPassword, resetPassword, changePassword, fetchMe, logout, tryRefresh,
  }
})
