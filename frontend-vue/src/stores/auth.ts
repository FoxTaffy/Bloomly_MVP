import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

// ── Types ─────────────────────────────────────────────────────────────────────
// Точно соответствует тому, что возвращает POST /api/auth/login → data.data.user
export interface User {
  id: string
  username: string
  email: string
  role: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem('auth_user') ?? 'null')
  } catch {
    return null
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────
export const useAuthStore = defineStore('auth', () => {
  // ── State ────────────────────────────────────────────────────────────────
  const token    = ref<string | null>(localStorage.getItem('access_token'))
  const user     = ref<User | null>(loadUser())
  const isLoading = ref(false)
  const error    = ref<string | null>(null)

  // ── Getters ──────────────────────────────────────────────────────────────
  const isAuthenticated = computed(() => !!token.value && !!user.value)

  const displayName = computed(() => user.value?.username ?? 'Пользователь')

  // Генерируем аватар через ui-avatars (пока у User нет поля avatar)
  const avatarUrl = computed(() => {
    const name = encodeURIComponent(user.value?.username ?? 'U')
    return `https://ui-avatars.com/api/?name=${name}&background=4C67CF&color=fff&bold=true&rounded=true&size=128`
  })

  // ── Actions ──────────────────────────────────────────────────────────────

  /**
   * Логин: POST /api/auth/login → сохраняем token + user в state и localStorage.
   */
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
        throw new Error(data.error?.message ?? 'Неверный email или пароль')
      }

      token.value = data.data.token
      user.value  = data.data.user

      // Сохраняем обе сущности: токен для запросов, user — для восстановления сессии,
      // т.к. GET /api/auth/me возвращает только JWT-payload (id + role), без username.
      localStorage.setItem('access_token', data.data.token)
      localStorage.setItem('auth_user', JSON.stringify(data.data.user))
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка подключения к серверу'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Регистрация: POST /api/auth/register.
   * После успеха автоматически логинимся.
   */
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
        throw new Error(data.error?.message ?? 'Ошибка регистрации')
      }

      // Сразу логинимся
      await login(email, password)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Ошибка подключения к серверу'
      isLoading.value = false
      throw e
    }
  }

  /**
   * Проверяем валидность токена через GET /api/auth/me.
   * Если 401 — разлогиниваем пользователя (токен истёк).
   * NOTE: /me возвращает только JWT-payload { id, role }, поэтому
   *       не обновляем user из ответа — берём сохранённые данные из localStorage.
   */
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

  /** Сбрасываем стейт и чистим localStorage. */
  function logout(): void {
    token.value = null
    user.value  = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('auth_user')
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  // При старте приложения, если токен есть в localStorage — проверяем его.
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
