import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface User {
  id: string
  username: string
  email: string
  role: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Tokens are kept in sessionStorage (cleared on tab/window close) rather than
// localStorage to reduce the XSS token-theft attack surface per AUTH RULES.
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

  const displayName = computed(() => user.value?.username ?? 'User')

  const avatarUrl = computed(() => {
    const name = encodeURIComponent(user.value?.username ?? 'U')
    return `https://ui-avatars.com/api/?name=${name}&background=4C67CF&color=fff&bold=true&rounded=true&size=128`
  })

  // ── Actions ──────────────────────────────────────────────────────────────

  async function login(email: string, password: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Invalid email or password')
      }

      token.value = data.data.token
      user.value  = data.data.user

      // sessionStorage: scoped to this browser tab/session only
      sessionStorage.setItem('access_token', data.data.token)
      sessionStorage.setItem('auth_user', JSON.stringify(data.data.user))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Connection error'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function register(email: string, username: string, password: string): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message ?? 'Registration failed')
      }

      await login(email, password)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Connection error'
      isLoading.value = false
      throw e
    }
  }

  async function fetchMe(): Promise<void> {
    if (!token.value) return
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      if (!res.ok) logout()
    } catch {
      logout()
    }
  }

  function logout(): void {
    token.value = null
    user.value  = null
    sessionStorage.removeItem('access_token')
    sessionStorage.removeItem('auth_user')
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  if (token.value) {
    fetchMe()
  }

  return {
    user,
    token,
    isLoading,
    error,
    isAuthenticated,
    displayName,
    avatarUrl,
    login,
    register,
    logout,
    fetchMe,
  }
})
