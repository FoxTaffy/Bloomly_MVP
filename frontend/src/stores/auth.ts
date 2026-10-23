import { apiErrorMessage, apiErrorStatus, errorMessage } from '@/lib/apiError'
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api, { setupApiAuth } from '../api'
import { claimAttribution } from '@/lib/attribution'

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
  commissions_status?: 'none' | 'open' | 'waitlist' | 'closed'
  subscription_expires_at?: string | null
  profile_theme?: string | null
  profile_bg_url?: string | null
  profile_frame?: string | null
  email_verified?: boolean
  is_verified?: boolean
  verification_type?: string | null
  onboarding_done?: boolean
  payment_region?: string | null
  is_adult?: boolean
  country?: string | null
  two_factor_method?: 'totp' | 'email' | null
  job_title?: string | null
  birth_date?: string | null
  created_at?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// User profile cached in sessionStorage for faster display on reload (NOT for auth)
// Роль и email в кэш не попадают: кэш правится в DevTools и читается с украденного ПК,
// поэтому права берутся только из ответа сервера (/auth/refresh, /auth/me).
function stripSensitive(u: User): User {
  const { role: _role, email: _email, ...rest } = u
  return { ...rest, role: 'user', email: '' } as User
}

export function cacheUser(u: User | null) {
  try {
    if (u) sessionStorage.setItem('auth_user', JSON.stringify(stripSensitive(u)))
  } catch { /* storage недоступен */ }
}

function loadUser(): User | null {
  try {
    const raw = sessionStorage.getItem('auth_user')
    const u = JSON.parse(raw ?? 'null')
    return u && typeof u === 'object' ? stripSensitive(u as User) : null
  } catch {
    return null
  }
}

function saveUser(u: User) {
  cacheUser(u)
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
  // Populated when a mid-session request comes back ACCOUNT_FROZEN — drives the
  // globally-mounted FrozenAccountModal (see App.vue) after the forced logout below.
  const frozenPrompt  = ref<{ show: boolean; email: string; reason: string } | null>(null)

  // ── Getters ──────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const displayName     = computed(() => user.value?.display_name || user.value?.username || 'User')
  const avatarUrl       = computed(() => user.value?.avatar_url ?? '')

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Restore session on page load by using the httpOnly refresh_token cookie.
   *  `lenient=true` (mid-session, triggered by the axios 401 interceptor) keeps the
   *  current session intact on a transient failure (network blip, 5xx) instead of
   *  wiping it — only a server-confirmed 401 means the session is actually dead.
   *  A confirmed 401 (no/expired refresh cookie) always wipes immediately — that's
   *  a real "not logged in", not a hiccup. Anything else (network blip, cold start,
   *  5xx, 429) is retried with backoff before the initial (non-lenient) call gives
   *  up, so a valid 30-day "remember me" cookie can't be thrown away by one bad
   *  request. */
  async function tryRefresh(lenient = false): Promise<boolean> {
    const maxAttempts = lenient ? 1 : 3
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await api.post('/auth/refresh')
        if (res.data.success) {
          token.value = res.data.data.token
          user.value  = res.data.data.user
          saveUser(res.data.data.user)
          return true
        }
      } catch (e) {
        const confirmedDead = apiErrorStatus(e) === 401
        if (confirmedDead) {
          token.value = null
          clearUser()
          user.value = null
          return false
        }
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 400))
          continue
        }
        if (!lenient) {
          clearUser()
          user.value = null
        }
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
      void claimAttribution()
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function register(
    email: string,
    username: string,
    password: string,
    consent?: { personalData?: boolean; cookies?: boolean; marketingEmails?: boolean }
  ): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/register', { email, username, password, consent })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Registration failed')
      // НЕ логиним автоматически — ждём подтверждения OTP
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
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
      void claimAttribution()
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
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
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
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
    void claimAttribution()
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
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
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
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
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
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
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
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
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
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
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
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
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
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /** Шаг 1 подключения TOTP — вернуть секрет + QR-код для сканирования */
  async function setupTotp(): Promise<{ secret: string; qrDataUrl: string }> {
    const res = await api.post('/auth/2fa/totp/setup')
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Setup failed')
    return res.data.data
  }

  /** Шаг 2 подключения TOTP — подтвердить код из приложения */
  async function confirmTotp(code: string): Promise<void> {
    const res = await api.post('/auth/2fa/totp/confirm', { code })
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Confirm failed')
    if (user.value) { user.value.two_factor_method = 'totp'; saveUser(user.value) }
  }

  /** Шаг 1 подключения email-2FA — отправить код на свою почту */
  async function enableEmail2fa(): Promise<void> {
    const res = await api.post('/auth/2fa/email/enable')
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Enable failed')
  }

  /** Шаг 2 подключения email-2FA — подтвердить код */
  async function confirmEmail2fa(code: string): Promise<void> {
    const res = await api.post('/auth/2fa/email/confirm', { code })
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Confirm failed')
    if (user.value) { user.value.two_factor_method = 'email'; saveUser(user.value) }
  }

  /** Отключение активного метода 2FA */
  async function disableTwoFactor(password?: string): Promise<void> {
    const res = await api.post('/auth/2fa/disable', { password })
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Disable failed')
    if (user.value) { user.value.two_factor_method = null; saveUser(user.value) }
  }

  /** Второй шаг входа — подтверждение кода второго фактора */
  async function verifyLoginTwoFactor(mfaToken: string, code: string, remember = false): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/login/2fa/verify', { mfaToken, code, remember })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Verification failed')
      token.value = data.data.token
      user.value  = data.data.user
      saveUser(data.data.user)
    } catch (e) {
      error.value = apiErrorMessage(e) || errorMessage(e) || 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /** Повторная отправка кода второго фактора при входе (метод email) */
  async function resendLoginTwoFactor(mfaToken: string): Promise<void> {
    const res = await api.post('/auth/login/2fa/resend', { mfaToken })
    if (!res.data.success) throw new Error(res.data.error?.message ?? 'Resend failed')
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
    } catch (e) {
      if (apiErrorStatus(e) === 401) logout()
    }
  }

  async function logout(): Promise<void> {
    try { await api.post('/auth/logout') } catch { /* best-effort */ }
    token.value = null
    user.value = null
    clearUser()
  }

  // Account got frozen while the session was active — kick the user out to the
  // main menu right away instead of leaving them logged in against a dead session,
  // then surface the same code-entry modal used at login so they can unfreeze on the spot.
  async function onFrozenDetected(reason: string): Promise<void> {
    if (frozenPrompt.value?.show) return // already showing (avoid dupes from parallel requests)
    const email = user.value?.email
    if (!email) return // not actually logged in — nothing to kick out of
    frozenPrompt.value = { show: true, email, reason }
    await logout()
    const { default: router } = await import('../router')
    router.push({ name: 'home' })
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
    onFrozenDetected,
  )

  // Restore session via httpOnly refresh_token cookie on page load
  tryRefresh().finally(() => { isInitialized.value = true })

  return {
    token, user, isLoading, isInitialized, error, frozenPrompt,
    isAuthenticated, displayName, avatarUrl,
    login, register, verifyEmail, resendOtp, loginWithToken,
    requestUnfreeze, confirmUnfreeze, exportData,
    forgotPassword, resetPassword, changePassword, requestEmailChange, confirmEmailChange, fetchMe, logout, tryRefresh,
    setupTotp, confirmTotp, enableEmail2fa, confirmEmail2fa, disableTwoFactor, verifyLoginTwoFactor, resendLoginTwoFactor,
  }
})
