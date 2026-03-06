import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

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
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadToken(): string | null {
  return localStorage.getItem('access_token') ?? sessionStorage.getItem('access_token')
}

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem('auth_user') ?? sessionStorage.getItem('auth_user')
    return JSON.parse(raw ?? 'null')
  } catch {
    return null
  }
}

function saveSession(token: string, user: User, remember: boolean) {
  const storage = remember ? localStorage : sessionStorage
  storage.setItem('access_token', token)
  storage.setItem('auth_user', JSON.stringify(user))
}

function clearSession() {
  ;['access_token', 'auth_user'].forEach(k => {
    localStorage.removeItem(k)
    sessionStorage.removeItem(k)
  })
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAuthStore = defineStore('auth', () => {
  // ── State ────────────────────────────────────────────────────────────────
  const token     = ref<string | null>(loadToken())
  const user      = ref<User | null>(loadUser())
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  // ── Getters ──────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => !!token.value && !!user.value)
  const displayName     = computed(() => user.value?.display_name || user.value?.username || 'User')
  const avatarUrl       = computed(() => user.value?.avatar_url ?? '')

  // ── Actions ──────────────────────────────────────────────────────────────

  async function login(email: string, password: string, remember = false): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/login', { email, password })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Invalid email or password')
      token.value = data.data.token
      user.value  = data.data.user
      saveSession(data.data.token, data.data.user, remember)
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
      const res = await api.post('/auth/verify-email', { email, code })
      const data = res.data
      if (!data.success) throw new Error(data.error?.message ?? 'Verification failed')
      token.value = data.data.token
      user.value  = data.data.user
      saveSession(data.data.token, data.data.user, remember)
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

  /** Вход через токен (после OAuth redirect или /verify-email) */
  function loginWithToken(jwtToken: string, savedUser: User, remember = true): void {
    token.value = jwtToken
    user.value  = savedUser
    saveSession(jwtToken, savedUser, remember)
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

  async function fetchMe(): Promise<void> {
    if (!token.value) return
    try {
      const res = await api.get('/auth/me')
      const data = res.data
      if (data.success) {
        user.value = data.data.user
        const inLocal = !!localStorage.getItem('access_token')
        saveSession(token.value!, data.data.user, inLocal)
      }
    } catch (e: any) {
      if (e?.response?.status === 401) logout()
    }
  }

  function logout() {
    token.value = null
    user.value = null
    clearSession()
  }

  if (token.value) fetchMe()

  return {
    token, user, isLoading, error,
    isAuthenticated, displayName, avatarUrl,
    login, register, verifyEmail, resendOtp, loginWithToken,
    forgotPassword, resetPassword, fetchMe, logout,
  }
})
