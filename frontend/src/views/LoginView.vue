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
  <div
    class="flex min-h-screen items-center justify-center bg-[#16192F] px-4 font-nunito"
  >
    <div
      class="w-full max-w-sm rounded-2xl border border-[#2A2D45] bg-[#1F223C] p-8 shadow-2xl
             shadow-black/40"
    >
      <!-- Логотип -->
      <div class="mb-8 flex flex-col items-center gap-3">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-2xl
                 bg-gradient-to-br from-[#4C67CF] to-[#7B5EA7] shadow-lg
                 shadow-[#4C67CF]/30"
        >
          <span class="text-xl font-extrabold text-white">B</span>
        </div>
        <h1 class="text-2xl font-extrabold tracking-tight text-white">Bloomly</h1>
        <p class="text-sm text-[#6B7280]">Социальная платформа</p>
      </div>

      <!-- Переключатель Войти / Регистрация -->
      <div class="mb-6 flex rounded-xl bg-[#16192F] p-1">
        <button
          @click="switchMode('login')"
          class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-150"
          :class="mode === 'login'
            ? 'bg-[#4C67CF] text-white shadow-md shadow-[#4C67CF]/20'
            : 'text-[#6B7280] hover:text-white'"
        >
          Войти
        </button>
        <button
          @click="switchMode('register')"
          class="flex-1 rounded-lg py-2 text-sm font-semibold transition-all duration-150"
          :class="mode === 'register'
            ? 'bg-[#4C67CF] text-white shadow-md shadow-[#4C67CF]/20'
            : 'text-[#6B7280] hover:text-white'"
        >
          Регистрация
        </button>
      </div>

      <!-- Форма -->
      <form @submit.prevent="onSubmit" class="flex flex-col gap-3">

        <!-- Email -->
        <div class="relative">
          <Mail class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
          <input
            v-model="email"
            type="email"
            placeholder="Email"
            required
            autocomplete="email"
            class="w-full rounded-xl border border-[#2A2D45] bg-[#16192F] py-3 pl-10 pr-4
                   text-sm text-white placeholder-[#6B7280] outline-none transition-colors
                   focus:border-[#4C67CF]"
          />
        </div>

        <!-- Username (только для регистрации) -->
        <Transition
          enter-from-class="opacity-0 -translate-y-2"
          enter-active-class="transition-all duration-200"
          leave-to-class="opacity-0 -translate-y-2"
          leave-active-class="transition-all duration-150"
        >
          <div v-if="mode === 'register'" class="relative">
            <User class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
            <input
              v-model="username"
              type="text"
              placeholder="Имя пользователя"
              required
              autocomplete="username"
              minlength="3"
              class="w-full rounded-xl border border-[#2A2D45] bg-[#16192F] py-3 pl-10 pr-4
                     text-sm text-white placeholder-[#6B7280] outline-none transition-colors
                     focus:border-[#4C67CF]"
            />
          </div>
        </Transition>

        <!-- Password -->
        <div class="relative">
          <Lock class="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]" />
          <input
            v-model="password"
            :type="showPass ? 'text' : 'password'"
            placeholder="Пароль"
            required
            autocomplete="current-password"
            minlength="6"
            class="w-full rounded-xl border border-[#2A2D45] bg-[#16192F] py-3 pl-10 pr-11
                   text-sm text-white placeholder-[#6B7280] outline-none transition-colors
                   focus:border-[#4C67CF]"
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
          <p
            v-if="auth.error"
            class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3
                   text-sm text-red-400"
          >
            {{ auth.error }}
          </p>
        </Transition>

        <!-- Кнопка отправки -->
        <button
          type="submit"
          :disabled="auth.isLoading"
          class="mt-1 rounded-xl bg-[#4C67CF] py-3 text-sm font-bold text-white shadow-md
                 shadow-[#4C67CF]/20 transition-all hover:bg-[#5a77e0]
                 hover:shadow-lg hover:shadow-[#4C67CF]/30
                 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span v-if="auth.isLoading">Загрузка...</span>
          <span v-else>{{ mode === 'login' ? 'Войти' : 'Создать аккаунт' }}</span>
        </button>
      </form>
    </div>
  </div>
</template>
