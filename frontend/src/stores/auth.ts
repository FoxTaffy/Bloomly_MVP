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
  avatar_video_url?: string | null
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

  /** Restore session on page load by using the httpOnly refresh_token cookie.
   *  `lenient=true` (mid-session, triggered by the axios 401 interceptor) keeps the
   *  current session intact on a transient failure (network blip, 5xx) instead of
   *  wiping it — only a server-confirmed 401 means the session is actually dead. */
  async function tryRefresh(lenient = false): Promise<boolean> {
    try {
      const res = await api.post('/auth/refresh')
      if (res.data.success) {
        token.value = res.data.data.token
        user.value  = res.data.data.user
        saveUser(res.data.data.user)
        return true
      }
    } catch (e: any) {
      const confirmedDead = e?.response?.status === 401
      if (!lenient || confirmedDead) {
        clearUser()
        user.value = null
      }
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

  async function resendOtp(email: string, purpose: 'register' | 'reset' | 'unfreeze'): Promise<void> {
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

  /** Экспорт своих данных — доступен даже забаненным/замороженным аккаунтам */
  async function exportData(email: string, password: string): Promise<any> {
    const res = await api.post('/auth/export-data', { email, password })
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Export failed')
    return res.data.data
  }

  /** Запрос кода разморозки на почту (для замороженного аккаунта) */
  async function requestUnfreeze(email: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      await api.post('/auth/unfreeze/request', { email })
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /** Подтверждение кода разморозки — снимает заморозку и логинит */
  async function confirmUnfreeze(email: string, code: string, remember = false): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/unfreeze/verify', { email, code, remember })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Unfreeze failed')
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

  /** Смена email Step 1 — код отправляется на текущую почту */
  async function requestEmailChange(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      await api.post('/auth/change-email/request')
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /** Смена email Step 2 — код с текущей почты подтверждает переход на новую */
  async function confirmEmailChange(code: string, newEmail: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/change-email/confirm', { code, newEmail })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Change email failed')
      if (user.value) { user.value.email = data.data.email; saveUser(user.value) }
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
      const ok = await tryRefresh(true)
      if (ok) return token.value
      // If we still have a user locally, tryRefresh judged this a transient
      // failure and deliberately left the session intact — signal "retry later"
      // rather than "session is dead" so the interceptor doesn't force a logout.
      return user.value ? undefined : null
    },
  )

  // Restore session via httpOnly refresh_token cookie on page load
  tryRefresh().finally(() => { isInitialized.value = true })

  return {
    token, user, isLoading, isInitialized, error,
    isAuthenticated, displayName, avatarUrl,
    login, register, verifyEmail, resendOtp, loginWithToken,
    requestUnfreeze, confirmUnfreeze, exportData,
    forgotPassword, resetPassword, changePassword, requestEmailChange, confirmEmailChange, fetchMe, logout, tryRefresh,
  }
})
