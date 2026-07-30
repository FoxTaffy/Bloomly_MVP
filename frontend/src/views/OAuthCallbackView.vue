<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

onMounted(async () => {
  const token = route.query.token as string | undefined
  const mfaToken = route.query.mfaToken as string | undefined
  const method = route.query.method as string | undefined

  // Аккаунт с включённой 2FA — бэкенд не выдал токены сразу, а прислал
  // mfaToken (тот же механизм, что и обычный логин по паролю). Передаём
  // пользователя на экран ввода второго фактора вместо мгновенного входа.
  if (mfaToken) {
    router.replace({ name: 'login', query: { mfaToken, method: method ?? 'totp', oauth2fa: '1' } })
    return
  }

  if (!token) {
    router.replace({ name: 'login', query: { error: 'oauth_failed' } })
    return
  }

  try {
    // Получаем профиль по токену
    const res = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.data?.success) {
      auth.loginWithToken(token, res.data.data.user, true)
      router.replace({ name: 'home' })
    } else {
      throw new Error('profile fetch failed')
    }
  } catch {
    router.replace({ name: 'login', query: { error: 'oauth_failed' } })
  }
})
</script>

<template>
  <!-- Промежуточный экран пока идёт редирект -->
  <div class="fixed inset-0 bg-[#0f0f18] flex flex-col items-center justify-center gap-4">
    <img src="/bloomly.png?v=2" class="h-12 animate-pulse opacity-70" alt="Bloomly" />
    <p class="text-white/40 text-sm font-medium">Входим через OAuth…</p>
  </div>
</template>
