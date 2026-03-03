<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, KeyRound, CheckCircle2, Monitor } from 'lucide-vue-next'
import api from '@/api'

const router = useRouter()
const auth   = useAuthStore()

type Mode = 'login' | 'register' | 'forgot' | 'reset'
const mode        = ref<Mode>('login')
const email       = ref('')
const username    = ref('')
const password    = ref('')
const newPassword = ref('')
const resetCode   = ref('')
const showPass    = ref(false)
const showNewPass = ref(false)
const remember    = ref(false)
const mounted     = ref(false)
const mouseX      = ref(50)
const mouseY      = ref(50)

// ── Реальная статистика ────────────────────────────────────────────────────
const statsData = ref({ users: 0, posts: 0, online: 0 })
const statsLoaded = ref(false)

function fmtNum(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '') + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'K'
  return n.toString()
}

async function loadStats() {
  try {
    const res = await api.get('/auth/stats')
    if (res.data?.success) {
      statsData.value = res.data.data
      statsLoaded.value = true
    }
  } catch { /* игнорируем */ }
}

const stats = computed(() => [
  { val: statsLoaded.value ? fmtNum(statsData.value.users)  : '…', label: 'участников' },
  { val: statsLoaded.value ? fmtNum(statsData.value.posts)  : '…', label: 'постов' },
  { val: statsLoaded.value ? fmtNum(statsData.value.online) : '…', label: 'онлайн' },
])

// ── Mount ─────────────────────────────────────────────────────────────────────
onMounted(() => {
  setTimeout(() => { mounted.value = true }, 60)
  loadStats()
  const card = document.getElementById('auth-card')
  if (card) {
    card.addEventListener('mousemove', (e: MouseEvent) => {
      const r = card.getBoundingClientRect()
      mouseX.value = ((e.clientX - r.left) / r.width) * 100
      mouseY.value = ((e.clientY - r.top) / r.height) * 100
    })
    card.addEventListener('mouseleave', () => { mouseX.value = 50; mouseY.value = 50 })
  }
})

// ── Mode helpers ───────────────────────────────────────────────────────────────
function switchMode(next: Mode) {
  mode.value = next; auth.error = null
  email.value = ''; username.value = ''; password.value = ''
  newPassword.value = ''; resetCode.value = ''
  showPass.value = false; showNewPass.value = false
}

// ── Submit handlers ───────────────────────────────────────────────────────────
async function onSubmit() {
  try {
    if (mode.value === 'login') {
      await auth.login(email.value, password.value, remember.value)
      router.push({ name: 'home' })
    } else if (mode.value === 'register') {
      await auth.register(email.value, username.value, password.value)
      router.push({ name: 'home' })
    } else if (mode.value === 'forgot') {
      await auth.forgotPassword(email.value)
      switchMode('reset')
    } else if (mode.value === 'reset') {
      await auth.resetPassword(resetCode.value, newPassword.value)
      switchMode('login')
    }
  } catch { /* auth.error уже записан */ }
}

// ── Сила пароля ───────────────────────────────────────────────────────────────
const activePassword = computed(() => mode.value === 'reset' ? newPassword.value : password.value)
const pwStrength = computed(() => {
  const p = activePassword.value
  if (!p) return 0
  let s = 0
  if (p.length >= 8) s++
  if (/[A-Z]/.test(p)) s++
  if (/[0-9]/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  return s
})
const pwLabel = computed(() => ['', 'Слабый', 'Средний', 'Хороший', 'Отличный'][pwStrength.value])
const pwColor = computed(() => ['', '#E14664', '#E76F51', '#FFC01F', '#66C770'][pwStrength.value])

// Частицы
const particles = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 0.8 + Math.random() * 2.2,
  dur: 3 + Math.random() * 6,
  delay: Math.random() * 8,
}))

const features = [
  { icon: '⚡', title: 'Молниеносная лента', desc: 'Алгоритм под тебя' },
  { icon: '🔐', title: 'E2E шифрование', desc: 'Сообщения только твои' },
  { icon: '🎨', title: 'Медиа-альбомы', desc: 'Фото, видео, истории' },
]
</script>

<template>
  <div class="page-root font-nunito text-white overflow-hidden">

    <!-- ══════════════════════ MESH AURORA BACKGROUND ══════════════════════ -->
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      <!-- Анимированный mesh gradient -->
      <div class="mesh-bg absolute inset-0"></div>
      <!-- Частицы -->
      <svg class="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <circle
          v-for="p in particles" :key="p.id"
          :cx="`${p.x}%`" :cy="`${p.y}%`"
          :r="p.size" fill="white"
          :style="{
            animation: `pFloat ${p.dur}s ease-in-out infinite alternate`,
            animationDelay: `${p.delay}s`,
            opacity: 0,
          }"
        />
      </svg>
      <!-- Сетка -->
      <div class="grid-overlay absolute inset-0 opacity-[0.025]"></div>
    </div>

    <!-- ══════════════════════ INNER LAYOUT ══════════════════════ -->
    <div class="relative z-10 min-h-screen w-full flex">

      <!-- ─────────── LEFT PANEL ─────────── -->
      <div class="hidden lg:flex lg:w-[58%] relative flex-col items-center justify-center px-16 py-12">

        <!-- Огромный декоративный логотип-гало -->
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] pointer-events-none"
          :style="{ opacity: 0.06 }"
        >
          <img src="/bloomly.png?v=2" class="w-full h-full object-contain" />
        </div>

        <div
          class="relative flex flex-col items-start max-w-lg transition-all duration-1000 ease-out"
          :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'"
        >
          <!-- Бейджик Beta -->
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/8 border border-white/12 text-xs font-bold text-white/60 mb-7 backdrop-blur-sm">
            <span class="w-1.5 h-1.5 rounded-full bg-[#FFC01F] shadow-[0_0_6px_#FFC01F] animate-pulse"></span>
            Bloomly Beta
          </div>

          <!-- Главный заголовок -->
          <h1 class="text-[72px] font-black leading-[0.9] tracking-tight mb-8">
            <span class="block text-white">Живи.</span>
            <span class="block hero-gradient">Общайся.</span>
            <span class="block text-white/30">Расцветай.</span>
          </h1>

          <p class="text-lg text-white/45 leading-relaxed mb-12 max-w-sm font-medium">
            Социальная сеть нового поколения. Персонализированная лента, закрытые сообщества и настоящие связи.
          </p>

          <!-- Статистика (реальная) -->
          <div class="flex gap-8 mb-14">
            <div
              v-for="(s, i) in stats" :key="s.label"
              class="transition-all duration-700"
              :style="{ transitionDelay: `${i * 100 + 200}ms` }"
              :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'"
            >
              <div class="text-3xl font-black hero-gradient leading-none mb-1 tabular-nums">{{ s.val }}</div>
              <div class="text-xs text-white/35 font-semibold uppercase tracking-wider">{{ s.label }}</div>
            </div>
          </div>

          <!-- Фичи -->
          <div class="flex flex-col gap-3 w-full">
            <div
              v-for="(f, i) in features" :key="f.title"
              class="feature-card transition-all duration-700 group"
              :style="{ transitionDelay: `${i * 80 + 400}ms` }"
              :class="mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'"
            >
              <div class="flex-shrink-0 w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center text-base group-hover:bg-brand-accent/20 group-hover:border-brand-accent/30 transition-all duration-200">
                {{ f.icon }}
              </div>
              <div>
                <div class="text-sm font-bold text-white/90">{{ f.title }}</div>
                <div class="text-xs text-white/35">{{ f.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ─────────── DIVIDER ─────────── -->
      <div class="hidden lg:block w-px self-stretch my-10 bg-gradient-to-b from-transparent via-white/8 to-transparent"></div>

      <!-- ─────────── RIGHT PANEL ─────────── -->
      <div class="w-full lg:w-[42%] flex items-center justify-center p-5 sm:p-8 lg:p-12">
        <div
          class="w-full max-w-[400px] transition-all duration-700 ease-out"
          :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
        >

          <!-- ──── КАРТОЧКА ──── -->
          <div id="auth-card" class="auth-card">
            <!-- Живая гало-подсветка под курсором -->
            <div
              class="card-glow pointer-events-none"
              :style="{
                background: `radial-gradient(280px circle at ${mouseX}% ${mouseY}%, rgba(76,103,207,0.18) 0%, transparent 70%)`,
              }"
            ></div>

            <!-- Тело карточки -->
            <div class="card-body">

              <!-- Мобильный логотип -->
              <div class="flex lg:hidden flex-col items-center mb-8">
                <div class="w-12 h-12 rounded-2xl bg-brand-accent/20 border border-brand-accent/30 flex items-center justify-center mb-3 shadow-[0_0_24px_rgba(76,103,207,0.4)]">
                  <img src="/bloomly.png?v=2" alt="Bloomly" class="w-8 h-8 object-contain" />
                </div>
                <span class="text-xl font-black hero-gradient">Bloomly</span>
              </div>

              <!-- Заголовок -->
              <div class="mb-6">
                <Transition name="t-head" mode="out-in">
                  <div :key="mode">
                    <h2 class="text-2xl font-black text-white mb-1">
                      {{ mode === 'login' ? 'С возвращением 👋'
                       : mode === 'register' ? 'Привет, новенький ✨'
                       : mode === 'forgot' ? 'Сброс пароля 🔑'
                       : 'Новый пароль 🛡️' }}
                    </h2>
                    <p class="text-sm text-white/35 font-medium">
                      {{ mode === 'login'    ? 'Войди, чтобы продолжить — твоя лента ждёт.'
                       : mode === 'register' ? 'Минута регистрации — и ты уже часть сообщества.'
                       : mode === 'forgot'   ? 'Введи email — мы отправим код для восстановления.'
                       :                      'Введи код из письма и придумай новый пароль.' }}
                    </p>
                  </div>
                </Transition>
              </div>

              <!-- Таб-переключатель (только для login/register) -->
              <div v-if="mode === 'login' || mode === 'register'" class="tab-switch mb-6">
                <div
                  class="tab-pill"
                  :class="mode === 'login' ? 'translate-x-0' : 'translate-x-full'"
                ></div>
                <button
                  @click="switchMode('login')"
                  class="tab-btn"
                  :class="mode === 'login' ? 'text-white' : 'text-white/35 hover:text-white/60'"
                >Вход</button>
                <button
                  @click="switchMode('register')"
                  class="tab-btn"
                  :class="mode === 'register' ? 'text-white' : 'text-white/35 hover:text-white/60'"
                >Регистрация</button>
              </div>

              <!-- Кнопка назад для forgot/reset -->
              <button
                v-if="mode === 'forgot' || mode === 'reset'"
                @click="switchMode('login')"
                class="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/60 transition-colors mb-5 -mt-1"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                Вернуться к входу
              </button>

              <!-- ФОРМА -->
              <form @submit.prevent="onSubmit" class="space-y-3.5">

                <!-- Email (login / register / forgot) -->
                <div v-if="mode !== 'reset'" class="input-group">
                  <Mail class="input-icon" />
                  <input v-model="email" type="email" placeholder="Email" required class="fld" />
                </div>

                <!-- Username (только register) -->
                <Transition
                  enter-active-class="transition-all duration-350 ease-out"
                  enter-from-class="opacity-0 max-h-0 -translate-y-2"
                  enter-to-class="opacity-100 max-h-20 translate-y-0"
                  leave-active-class="transition-all duration-250 ease-in"
                  leave-from-class="opacity-100 max-h-20 translate-y-0"
                  leave-to-class="opacity-0 max-h-0 -translate-y-2"
                >
                  <div v-if="mode === 'register'" class="input-group overflow-hidden">
                    <User class="input-icon" />
                    <input v-model="username" type="text" placeholder="Имя пользователя" required minlength="3" class="fld" />
                  </div>
                </Transition>

                <!-- Password (login / register) -->
                <div v-if="mode === 'login' || mode === 'register'" class="input-group">
                  <Lock class="input-icon" />
                  <input
                    v-model="password"
                    :type="showPass ? 'text' : 'password'"
                    placeholder="Пароль"
                    required minlength="6"
                    class="fld pr-12"
                  />
                  <button type="button" @click="showPass = !showPass"
                    class="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                    <component :is="showPass ? EyeOff : Eye" class="w-[18px] h-[18px]" />
                  </button>
                </div>

                <!-- Ссылка «Забыл пароль» (только login) -->
                <div v-if="mode === 'login'" class="flex justify-end -mt-1">
                  <button type="button" @click="switchMode('forgot')"
                    class="text-xs text-white/35 hover:text-brand-accent-minus transition-colors font-semibold">
                    Забыл пароль?
                  </button>
                </div>

                <!-- Запомнить устройство (только login) -->
                <label v-if="mode === 'login'" class="flex items-center gap-3 cursor-pointer select-none group">
                  <div class="relative w-10 h-5.5 flex-shrink-0">
                    <input type="checkbox" v-model="remember" class="sr-only peer" />
                    <div class="w-10 h-5 rounded-full border border-white/12 bg-white/5 peer-checked:bg-brand-accent peer-checked:border-brand-accent transition-all duration-200"></div>
                    <div class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white/40 peer-checked:bg-white peer-checked:translate-x-5 transition-all duration-200 shadow-sm"></div>
                  </div>
                  <span class="text-xs font-semibold text-white/35 group-hover:text-white/55 transition-colors flex items-center gap-1.5">
                    <Monitor class="w-3.5 h-3.5" />
                    Запомнить это устройство
                  </span>
                </label>

                <!-- Код сброса (режим reset) -->
                <div v-if="mode === 'reset'" class="input-group">
                  <KeyRound class="input-icon" />
                  <input v-model="resetCode" type="text" placeholder="6-значный код" required maxlength="6" pattern="[0-9]{6}" class="fld tracking-[0.3em] text-center" />
                </div>

                <!-- Новый пароль (режим reset) -->
                <div v-if="mode === 'reset'" class="input-group">
                  <Lock class="input-icon" />
                  <input
                    v-model="newPassword"
                    :type="showNewPass ? 'text' : 'password'"
                    placeholder="Новый пароль"
                    required minlength="6"
                    class="fld pr-12"
                  />
                  <button type="button" @click="showNewPass = !showNewPass"
                    class="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                    <component :is="showNewPass ? EyeOff : Eye" class="w-[18px] h-[18px]" />
                  </button>
                </div>

                <!-- Индикатор силы пароля -->
                <Transition
                  enter-active-class="transition-all duration-300"
                  enter-from-class="opacity-0 max-h-0"
                  enter-to-class="opacity-100 max-h-16"
                  leave-active-class="transition-all duration-200"
                  leave-to-class="opacity-0 max-h-0"
                >
                  <div v-if="(mode === 'register' || mode === 'reset') && activePassword.length > 0" class="overflow-hidden px-1">
                    <div class="flex gap-1.5 mb-1.5">
                      <div v-for="n in 4" :key="n" class="h-1 flex-1 rounded-full transition-all duration-400"
                        :style="{ background: n <= pwStrength ? pwColor : 'rgba(255,255,255,0.08)' }"></div>
                    </div>
                    <p class="text-xs font-bold transition-colors duration-300" :style="{ color: pwColor }">{{ pwLabel }}</p>
                  </div>
                </Transition>

                <!-- Успех forgot → показываем подсказку -->
                <div v-if="mode === 'reset'" class="flex items-start gap-2.5 p-3.5 rounded-2xl bg-green-500/8 border border-green-500/20">
                  <CheckCircle2 class="w-4 h-4 shrink-0 mt-0.5 text-green-400" />
                  <p class="text-xs text-green-400 font-semibold">Код отправлен на {{ email || 'ваш email' }}. Проверьте почту.</p>
                </div>

                <!-- Ошибка -->
                <Transition
                  enter-active-class="transition-all duration-300"
                  enter-from-class="opacity-0 -translate-y-1 scale-[0.98]"
                  enter-to-class="opacity-100 translate-y-0 scale-100"
                  leave-active-class="transition-all duration-200"
                  leave-to-class="opacity-0 scale-[0.98]"
                >
                  <div v-if="auth.error" class="flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-500/8 border border-red-500/20">
                    <svg class="w-4 h-4 shrink-0 mt-0.5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                    <p class="text-sm text-red-400 font-semibold">{{ auth.error }}</p>
                  </div>
                </Transition>

                <!-- КНОПКА -->
                <button type="submit" :disabled="auth.isLoading" class="cta-btn">
                  <span class="cta-shimmer"></span>
                  <span v-if="auth.isLoading" class="flex items-center justify-center gap-2 relative z-10">
                    <svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                    </svg>
                    Загрузка...
                  </span>
                  <span v-else class="flex items-center justify-center gap-2.5 relative z-10">
                    {{ mode === 'login'    ? 'Войти'
                     : mode === 'register' ? 'Создать аккаунт'
                     : mode === 'forgot'   ? 'Отправить код'
                     :                      'Сменить пароль' }}
                    <ArrowRight class="w-5 h-5" />
                  </span>
                </button>
              </form>

              <!-- Footer links -->
              <p class="mt-6 text-center text-xs text-white/20 leading-relaxed">
                Нажимая кнопку, ты принимаешь
                <a href="#" class="text-white/40 hover:text-brand-accent-minus underline-offset-2 hover:underline transition-colors">Условия</a>
                и
                <a href="#" class="text-white/40 hover:text-brand-accent-minus underline-offset-2 hover:underline transition-colors">Политику</a>
              </p>
            </div>
          </div>

          <!-- Декоративная подсветка снизу -->
          <div class="h-px mt-3 w-2/3 mx-auto bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent blur-sm"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ══ ROOT ══════════════════════════════════════════════════════════ */
.page-root {
  position: relative;
  min-height: 100svh;
  background: #080b1a;
}

/* ══ MESH BG ══════════════════════════════════════════════════════ */
.mesh-bg {
  background:
    radial-gradient(ellipse 80% 60% at 20% 20%,  rgba(76, 103, 207, 0.28) 0%, transparent 60%),
    radial-gradient(ellipse 60% 50% at 80% 70%,  rgba(205, 131, 245, 0.20) 0%, transparent 55%),
    radial-gradient(ellipse 50% 40% at 60% 10%,  rgba(59, 130, 246, 0.16) 0%, transparent 50%),
    radial-gradient(ellipse 70% 60% at 10% 80%,  rgba(139, 110, 216, 0.14) 0%, transparent 55%),
    #080b1a;
  animation: meshDrift 14s ease-in-out infinite alternate;
}
@keyframes meshDrift {
  0%   { filter: hue-rotate(0deg) brightness(1); }
  100% { filter: hue-rotate(18deg) brightness(1.08); }
}

/* ══ GRID OVERLAY ══════════════════════════════════════════════════ */
.grid-overlay {
  background-image:
    linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px);
  background-size: 48px 48px;
}

/* ══ PARTICLES ═════════════════════════════════════════════════════ */
@keyframes pFloat {
  0%   { opacity: 0.05; transform: translateY(0) scale(1); }
  50%  { opacity: 0.55; }
  100% { opacity: 0.08; transform: translateY(-20px) scale(1.3); }
}

/* ══ HERO GRADIENT ═════════════════════════════════════════════════ */
.hero-gradient {
  background: linear-gradient(135deg, #7B9CFF 0%, #CD83F5 50%, #F7A9E2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ══ FEATURE CARD ══════════════════════════════════════════════════ */
.feature-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  backdrop-filter: blur(8px);
}
.feature-card:hover {
  background: rgba(76,103,207,0.08);
  border-color: rgba(76,103,207,0.25);
}

/* ══ AUTH CARD ═════════════════════════════════════════════════════ */
.auth-card {
  position: relative;
  border-radius: 28px;
  background: rgba(12, 15, 32, 0.8);
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(40px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(76,103,207,0.12),
    0 32px 64px rgba(0,0,0,0.5),
    0 8px 24px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.06);
  overflow: hidden;
  transition: box-shadow 0.3s ease;
}
.auth-card:hover {
  box-shadow:
    0 0 0 1px rgba(76,103,207,0.22),
    0 40px 80px rgba(0,0,0,0.55),
    0 12px 32px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.07);
}

/* Живое свечение под курсором */
.card-glow {
  position: absolute;
  inset: 0;
  border-radius: 28px;
  z-index: 0;
  transition: background 0.1s ease;
  pointer-events: none;
}

.card-body {
  position: relative;
  z-index: 1;
  padding: 32px;
}
@media (min-width: 640px) { .card-body { padding: 40px; } }

/* ══ TAB SWITCH ════════════════════════════════════════════════════ */
.tab-switch {
  position: relative;
  display: flex;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 18px;
  padding: 4px;
}
.tab-pill {
  position: absolute;
  top: 4px; bottom: 4px;
  width: calc(50% - 4px);
  left: 4px;
  border-radius: 14px;
  background: linear-gradient(135deg, #4C67CF, #7B6FD4);
  box-shadow: 0 4px 16px rgba(76,103,207,0.4), 0 1px 0 rgba(255,255,255,0.1) inset;
  transition: transform 0.35s cubic-bezier(.68,-.4,.27,1.4);
}
.tab-btn {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 10px;
  font-weight: 800;
  font-size: 13px;
  border-radius: 14px;
  transition: color 0.25s;
  letter-spacing: 0.01em;
}

/* ══ INPUT GROUP ═══════════════════════════════════════════════════ */
.input-group {
  position: relative;
  display: flex;
  align-items: center;
}
.input-icon {
  position: absolute;
  left: 16px;
  width: 17px;
  height: 17px;
  color: rgba(255,255,255,0.22);
  pointer-events: none;
  transition: color 0.2s;
  flex-shrink: 0;
  z-index: 1;
}
.input-group:focus-within .input-icon {
  color: rgba(163,184,255,0.7);
}
.fld {
  width: 100%;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
  padding: 14px 16px 14px 44px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  outline: none;
  transition: all 0.2s ease;
  caret-color: #7b9cff;
}
.fld::placeholder {
  color: rgba(255,255,255,0.2);
  font-weight: 500;
}
.fld:focus {
  border-color: rgba(76,103,207,0.6);
  background: rgba(76,103,207,0.07);
  box-shadow: 0 0 0 3px rgba(76,103,207,0.15), inset 0 1px 0 rgba(255,255,255,0.04);
}

/* ══ CTA BUTTON ════════════════════════════════════════════════════ */
.cta-btn {
  position: relative;
  width: 100%;
  margin-top: 6px;
  padding: 15px 28px;
  border-radius: 18px;
  font-weight: 900;
  font-size: 15px;
  letter-spacing: 0.02em;
  color: white;
  overflow: hidden;
  transition: all 0.25s ease;
  background: linear-gradient(135deg, #3d56c4 0%, #6057cc 50%, #7B4FD0 100%);
  box-shadow:
    0 8px 24px rgba(76,103,207,0.45),
    0 2px 6px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.15);
}
.cta-btn:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow:
    0 14px 36px rgba(76,103,207,0.6),
    0 4px 10px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.18);
}
.cta-btn:not(:disabled):active {
  transform: translateY(0) scale(0.983);
  box-shadow: 0 6px 16px rgba(76,103,207,0.35), inset 0 1px 0 rgba(255,255,255,0.1);
}
.cta-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
/* Shimmer sweep */
.cta-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%);
  background-size: 200% 100%;
  background-position: 200% 0;
  border-radius: inherit;
  animation: shimmerSweep 2.8s ease infinite;
}
@keyframes shimmerSweep {
  0%   { background-position: 200% 0; }
  60%  { background-position: -200% 0; }
  100% { background-position: -200% 0; }
}

/* ══ HEAD TRANSITION ═══════════════════════════════════════════════ */
.t-head-enter-active { transition: all 0.3s cubic-bezier(.4,0,.2,1); }
.t-head-leave-active { transition: all 0.18s cubic-bezier(.4,0,.2,1); }
.t-head-enter-from  { opacity: 0; transform: translateY(6px); }
.t-head-leave-to    { opacity: 0; transform: translateY(-6px); }

/* ══ TOGGLE SWITCH ═════════════════════════════════════════════════ */
.peer:checked ~ div { background: theme('colors.brand.accent'); border-color: theme('colors.brand.accent'); }
.peer:checked ~ div + div { transform: translateX(20px); background: white; }
</style>
