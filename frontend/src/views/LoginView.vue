<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-vue-next'

const router = useRouter()
const auth   = useAuthStore()

// ── Form state ────────────────────────────────────────────────────────────────
type Mode = 'login' | 'register'
const mode       = ref<Mode>('login')
const email      = ref('')
const username   = ref('')
const password   = ref('')
const showPass   = ref(false)

function switchMode(next: Mode) {
  mode.value     = next
  auth.error     = null
  email.value    = ''
  username.value = ''
  password.value = ''
  showPass.value = false
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function onSubmit() {
  try {
    if (mode.value === 'login') {
      await auth.login(email.value, password.value)
    } else {
      await auth.register(email.value, username.value, password.value)
    }
    router.push({ name: 'home' })
  } catch {
    // Ошибка уже записана в auth.error — отображаем в шаблоне
  }
}
</script>

<template>
  <!-- Outer wrapper with decorative background glows -->
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#16192F] px-4 font-nunito">

    <!-- Decorative background blobs -->
    <div class="pointer-events-none absolute inset-0 overflow-hidden">
      <div class="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#4C67CF]/10 blur-3xl" />
      <div class="absolute -bottom-40 -right-40 h-[30rem] w-[30rem] rounded-full bg-[#7B5EA7]/10 blur-3xl" />
      <div class="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-[#4C67CF]/5 blur-2xl" />
    </div>

    <!-- Card with gradient border -->
    <div class="relative z-10 w-full max-w-sm">
      <div class="rounded-2xl bg-gradient-to-br from-[#4C67CF]/30 via-[#2A2D45]/50 to-[#7B5EA7]/20 p-px shadow-2xl shadow-black/60">
        <div class="rounded-2xl bg-[#1F223C] p-8">

          <!-- Логотип -->
          <div class="mb-8 flex flex-col items-center gap-3">
            <div class="relative">
              <div class="absolute inset-0 rounded-2xl bg-[#4C67CF]/30 blur-md" />
              <div
                class="relative flex h-14 w-14 items-center justify-center rounded-2xl
                       bg-gradient-to-br from-[#4C67CF] to-[#7B5EA7] shadow-lg
                       shadow-[#4C67CF]/30"
              >
                <span class="text-2xl font-extrabold text-white">B</span>
              </div>
            </div>
            <div class="text-center">
              <h1 class="text-2xl font-extrabold tracking-tight text-white">Bloomly</h1>
              <p class="mt-0.5 text-sm text-[#6B7280]">Социальная платформа</p>
            </div>
          </div>

          <!-- Переключатель Войти / Регистрация -->
          <div class="mb-6 flex rounded-xl bg-[#16192F] p-1">
            <button
              @click="switchMode('login')"
              class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-200"
              :class="mode === 'login'
                ? 'bg-gradient-to-r from-[#4C67CF] to-[#5a77e0] text-white shadow-md shadow-[#4C67CF]/30'
                : 'text-[#6B7280] hover:text-white'"
            >
              Войти
            </button>
            <button
              @click="switchMode('register')"
              class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-200"
              :class="mode === 'register'
                ? 'bg-gradient-to-r from-[#4C67CF] to-[#5a77e0] text-white shadow-md shadow-[#4C67CF]/30'
                : 'text-[#6B7280] hover:text-white'"
            >
              Регистрация
            </button>
          </div>

          <!-- Форма -->
          <form @submit.prevent="onSubmit" class="flex flex-col gap-3">

            <!-- Email -->
            <div class="group relative">
              <Mail
                class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]
                       transition-colors group-focus-within:text-[#4C67CF]"
              />
              <input
                v-model="email"
                type="email"
                placeholder="Email"
                required
                autocomplete="email"
                class="w-full rounded-xl border border-[#2A2D45] bg-[#16192F] py-3 pl-10 pr-4
                       text-sm text-white placeholder-[#6B7280] outline-none
                       transition-all duration-200
                       focus:border-[#4C67CF] focus:ring-2 focus:ring-[#4C67CF]/20"
              />
            </div>

            <!-- Username (только для регистрации) -->
            <Transition
              enter-from-class="opacity-0 -translate-y-2"
              enter-active-class="transition-all duration-200"
              leave-to-class="opacity-0 -translate-y-2"
              leave-active-class="transition-all duration-150"
            >
              <div v-if="mode === 'register'" class="group relative">
                <User
                  class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]
                         transition-colors group-focus-within:text-[#4C67CF]"
                />
                <input
                  v-model="username"
                  type="text"
                  placeholder="Имя пользователя"
                  required
                  autocomplete="username"
                  minlength="3"
                  class="w-full rounded-xl border border-[#2A2D45] bg-[#16192F] py-3 pl-10 pr-4
                         text-sm text-white placeholder-[#6B7280] outline-none
                         transition-all duration-200
                         focus:border-[#4C67CF] focus:ring-2 focus:ring-[#4C67CF]/20"
                />
              </div>
            </Transition>

            <!-- Password -->
            <div class="group relative">
              <Lock
                class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]
                       transition-colors group-focus-within:text-[#4C67CF]"
              />
              <input
                v-model="password"
                :type="showPass ? 'text' : 'password'"
                placeholder="Пароль"
                required
                autocomplete="current-password"
                minlength="6"
                class="w-full rounded-xl border border-[#2A2D45] bg-[#16192F] py-3 pl-10 pr-11
                       text-sm text-white placeholder-[#6B7280] outline-none
                       transition-all duration-200
                       focus:border-[#4C67CF] focus:ring-2 focus:ring-[#4C67CF]/20"
              />
              <button
                type="button"
                @click="showPass = !showPass"
                class="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6B7280]
                       transition-colors hover:text-white"
                tabindex="-1"
              >
                <component :is="showPass ? EyeOff : Eye" class="h-4 w-4" />
              </button>
            </div>

            <!-- Ошибка -->
            <Transition
              enter-from-class="opacity-0 scale-95"
              enter-active-class="transition-all duration-200"
              leave-to-class="opacity-0 scale-95"
              leave-active-class="transition-all duration-150"
            >
              <div
                v-if="auth.error"
                class="flex items-start gap-2 rounded-xl border border-red-500/20
                       bg-red-500/10 px-4 py-3"
              >
                <span aria-hidden="true" class="mt-0.5 shrink-0 text-base leading-none text-red-400">⚠</span>
                <p class="text-sm text-red-400">{{ auth.error }}</p>
              </div>
            </Transition>

            <!-- Кнопка отправки -->
            <button
              type="submit"
              :disabled="auth.isLoading"
              class="mt-1 rounded-xl bg-gradient-to-r from-[#4C67CF] to-[#5a77e0] py-3
                     text-sm font-bold text-white shadow-md shadow-[#4C67CF]/25
                     transition-all duration-200
                     hover:brightness-110 hover:shadow-lg hover:shadow-[#4C67CF]/40
                     active:scale-[0.98]
                     disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span v-if="auth.isLoading" class="flex items-center justify-center gap-2">
                <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Загрузка...
              </span>
              <span v-else>{{ mode === 'login' ? 'Войти' : 'Создать аккаунт' }}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
