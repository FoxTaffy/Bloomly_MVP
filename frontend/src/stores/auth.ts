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
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadUser(): User | null {
  try {
    return JSON.parse(sessionStorage.getItem('auth_user') ?? 'null')
  } catch {
    return null
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAuthStore = defineStore('auth', () => {
  // ── State ────────────────────────────────────────────────────────────────
  const token     = ref<string | null>(sessionStorage.getItem('access_token'))
  const user      = ref<User | null>(loadUser())
  const isLoading = ref(false)
  const error     = ref<string | null>(null)

  // ── Getters ──────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => !!token.value && !!user.value)

  const displayName = computed(() => user.value?.display_name || user.value?.username || 'User')

  const avatarUrl = computed(() => {
    if (user.value?.avatar_url) return user.value.avatar_url
    const name = encodeURIComponent(user.value?.display_name || user.value?.username || 'U')
    return `https://ui-avatars.com/api/?name=${name}&background=4C67CF&color=fff&bold=true&rounded=true&size=128`
  })

  // ── Actions ──────────────────────────────────────────────────────────────

  async function login(email: string, password: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await api.post('/auth/login', { email, password })
      const data = res.data

      if (!data.success) {
        throw new Error(data.error?.message ?? 'Invalid email or password')
      }

      token.value = data.data.token
      user.value  = data.data.user

      sessionStorage.setItem('access_token', data.data.token)
      sessionStorage.setItem('auth_user', JSON.stringify(data.data.user))
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

      if (!data.success) {
        throw new Error(data.error?.message ?? 'Registration failed')
      }

      await login(email, password)
    } catch (e: any) {
      error.value = e.response?.data?.error?.message || e.message || 'Connection error'
      isLoading.value = false
      throw e
    }
  }

  async function fetchMe(): Promise<void> {
    if (!token.value) return
    try {
      const res = await api.get('/auth/me')
      const data = res.data
      if (data.success) {
        user.value = data.data.user
        sessionStorage.setItem('auth_user', JSON.stringify(data.data.user))
      }
    } catch (e: any) {
      // Only hard-logout on 401 (token invalid/expired).
      // Ignore 429, 5xx, network errors — they must not wipe the session.
      if (e?.response?.status === 401) {
        logout()
      }
    }
  }

  function logout() {
    token.value = null
    user.value = null
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('auth_user')
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  if (token.value) {
    fetchMe()
  }

  return {
    token,
    user,
    isLoading,
    error,
    isAuthenticated,
    displayName,
    avatarUrl,
    login,
    register,
    fetchMe,
    logout,
  }
})
