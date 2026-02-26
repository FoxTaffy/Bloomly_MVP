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
  <div class="min-h-screen w-full flex bg-brand-bg font-nunito text-white overflow-hidden">
    <!-- Left Side: Branding & Decorative (Hidden on mobile) -->
    <div class="hidden lg:flex lg:w-1/2 relative items-center justify-center overflow-hidden">
      <!-- Animated background gradients -->
      <div class="absolute inset-0 bg-gradient-to-br from-[#1F223C] via-[#16192F] to-[#2A1B4E]"></div>
      <div class="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div class="absolute -top-[20%] -left-[10%] w-[70%] h-[70%] rounded-full bg-brand-accent mix-blend-screen filter blur-[120px] opacity-30 animate-blob"></div>
        <div class="absolute top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-brand-purple mix-blend-screen filter blur-[120px] opacity-30 animate-blob animation-delay-2000"></div>
        <div class="absolute -bottom-[20%] left-[20%] w-[80%] h-[80%] rounded-full bg-[#3B82F6] mix-blend-screen filter blur-[120px] opacity-20 animate-blob animation-delay-4000"></div>
      </div>
      
      <div class="relative z-10 flex flex-col items-center text-center px-12">
        <div class="mb-8 relative">
          <div class="absolute inset-0 bg-white/20 blur-2xl rounded-full"></div>
          <div class="w-24 h-24 bg-brand-accent rounded-3xl rotate-12 flex items-center justify-center shadow-2xl shadow-brand-accent/40 border border-brand-border">
            <span class="text-5xl font-black text-white -rotate-12">B</span>
          </div>
        </div>
        <h1 class="text-5xl font-extrabold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white via-blue-100 to-[#CD83F5]">
          Добро пожаловать в Bloomly
        </h1>
        <p class="text-lg text-blue-200/80 max-w-md leading-relaxed">
          Присоединяйтесь к нашему сообществу. Делитесь идеями, находите единомышленников и создавайте свою историю.
        </p>
      </div>
    </div>

    <!-- Right Side: Form -->
    <div class="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10">
      <!-- Mobile background blobs -->
      <div class="absolute inset-0 overflow-hidden lg:hidden pointer-events-none">
        <div class="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-brand-accent/20 blur-3xl"></div>
        <div class="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-brand-purple/20 blur-3xl"></div>
      </div>

      <div class="w-full max-w-md relative">
        <!-- Form Card -->
        <div class="bg-brand-card backdrop-blur-xl rounded-3xl border border-brand-border shadow-2xl p-8 sm:p-10">
          
          <!-- Mobile Logo -->
          <div class="flex lg:hidden flex-col items-center mb-8">
            <div class="w-16 h-16 bg-brand-accent rounded-2xl flex items-center justify-center shadow-lg shadow-brand-accent/30 mb-4">
              <span class="text-3xl font-black text-white">B</span>
            </div>
            <h2 class="text-2xl font-bold">Bloomly</h2>
          </div>

          <div class="text-center mb-8 lg:text-left">
            <h2 class="text-3xl font-bold mb-2">{{ mode === 'login' ? 'С возвращением!' : 'Создать аккаунт' }}</h2>
            <p class="text-brand-muted">
              {{ mode === 'login' ? 'Рады видеть вас снова. Пожалуйста, войдите.' : 'Начните свой путь вместе с нами сегодня.' }}
            </p>
          </div>

          <!-- Mode Switcher -->
          <div class="flex p-1 bg-brand-bg/80 rounded-2xl mb-8 border border-brand-border">
            <button
              @click="switchMode('login')"
              class="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300"
              :class="mode === 'login' ? 'bg-brand-border text-white shadow-lg border border-brand-accent/30' : 'text-brand-muted hover:text-white'"
            >
              Вход
            </button>
            <button
              @click="switchMode('register')"
              class="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300"
              :class="mode === 'register' ? 'bg-brand-border text-white shadow-lg border border-brand-accent/30' : 'text-brand-muted hover:text-white'"
            >
              Регистрация
            </button>
          </div>

          <!-- Form -->
          <form @submit.prevent="onSubmit" class="space-y-5">
            
            <!-- Email -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-brand-muted ml-1">Email</label>
              <div class="relative group">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail class="h-5 w-5 text-brand-muted group-focus-within:text-brand-accent transition-colors" />
                </div>
                <input
                  v-model="email"
                  type="email"
                  placeholder="name@example.com"
                  required
                  class="w-full bg-brand-bg border border-brand-border rounded-xl py-3.5 pl-11 pr-4 text-white placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
                />
              </div>
            </div>

            <!-- Username -->
            <Transition
              enter-active-class="transition-all duration-300 ease-out"
              enter-from-class="opacity-0 -translate-y-4 max-h-0"
              enter-to-class="opacity-100 translate-y-0 max-h-24"
              leave-active-class="transition-all duration-200 ease-in"
              leave-from-class="opacity-100 translate-y-0 max-h-24"
              leave-to-class="opacity-0 -translate-y-4 max-h-0"
            >
              <div v-if="mode === 'register'" class="space-y-1.5 overflow-hidden">
                <label class="text-sm font-medium text-brand-muted ml-1">Имя пользователя</label>
                <div class="relative group">
                  <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User class="h-5 w-5 text-brand-muted group-focus-within:text-brand-accent transition-colors" />
                  </div>
                  <input
                    v-model="username"
                    type="text"
                    placeholder="johndoe"
                    required
                    minlength="3"
                    class="w-full bg-brand-bg border border-brand-border rounded-xl py-3.5 pl-11 pr-4 text-white placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
                  />
                </div>
              </div>
            </Transition>

            <!-- Password -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium text-brand-muted ml-1">Пароль</label>
              <div class="relative group">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock class="h-5 w-5 text-brand-muted group-focus-within:text-brand-accent transition-colors" />
                </div>
                <input
                  v-model="password"
                  :type="showPass ? 'text' : 'password'"
                  placeholder="••••••••"
                  required
                  minlength="6"
                  class="w-full bg-brand-bg border border-brand-border rounded-xl py-3.5 pl-11 pr-12 text-white placeholder-brand-muted focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/30 transition-all"
                />
                <button
                  type="button"
                  @click="showPass = !showPass"
                  class="absolute inset-y-0 right-0 pr-4 flex items-center text-brand-muted hover:text-white transition-colors"
                >
                  <component :is="showPass ? EyeOff : Eye" class="h-5 w-5" />
                </button>
              </div>
            </div>

            <!-- Error Message -->
            <Transition
              enter-active-class="transition-all duration-300"
              enter-from-class="opacity-0 scale-95"
              leave-active-class="transition-all duration-200"
              leave-to-class="opacity-0 scale-95"
            >
              <div v-if="auth.error" class="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                <div class="mt-0.5 text-red-400">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                </div>
                <p class="text-sm text-red-400">{{ auth.error }}</p>
              </div>
            </Transition>

            <!-- Submit Button -->
            <button
              type="submit"
              :disabled="auth.isLoading"
              class="w-full py-3.5 mt-4 rounded-xl bg-brand-accent hover:bg-brand-accent-plus text-white font-bold text-lg shadow-lg shadow-brand-accent/30 hover:shadow-brand-accent/45 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              <span v-if="auth.isLoading" class="flex items-center justify-center gap-2">
                <svg class="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Загрузка...
              </span>
              <span v-else>{{ mode === 'login' ? 'Войти' : 'Создать аккаунт' }}</span>
            </button>
          </form>
          
          <!-- Footer -->
          <p class="mt-8 text-center text-sm text-brand-muted">
            Продолжая, вы соглашаетесь с нашими
            <a href="#" class="text-brand-accent hover:text-white transition-colors">Условиями использования</a> и
            <a href="#" class="text-brand-accent hover:text-white transition-colors">Политикой конфиденциальности</a>.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes blob {
  0% { transform: translate(0px, 0px) scale(1); }
  33% { transform: translate(30px, -50px) scale(1.1); }
  66% { transform: translate(-20px, 20px) scale(0.9); }
  100% { transform: translate(0px, 0px) scale(1); }
}
.animate-blob {
  animation: blob 7s infinite;
}
.animation-delay-2000 {
  animation-delay: 2s;
}
.animation-delay-4000 {
  animation-delay: 4s;
}
</style>
