<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute, RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import {
  EnvelopeIcon,
  LockClosedIcon,
  UserIcon,
  EyeIcon,
  EyeSlashIcon,
  ArrowRightIcon,
  KeyIcon,
  CheckCircleIcon,
  ComputerDesktopIcon,
  ShieldCheckIcon,
} from '@heroicons/vue/24/solid'
import api from '@/api'
import FrozenAccountModal from '@/components/FrozenAccountModal.vue'
import BannedAccountModal from '@/components/BannedAccountModal.vue'

const router = useRouter()
const route  = useRoute()
const auth   = useAuthStore()

// ── Заморозка / бан ────────────────────────────────────────────────────────
const showFrozenModal = ref(false)
const showBannedModal = ref(false)
const blockedReason   = ref('')

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'twofactor'
const mode        = ref<Mode>('login')
const email       = ref('')
const username    = ref('')
const password    = ref('')
const newPassword = ref('')
const resetCode   = ref('')
const otpCode     = ref('')   // код подтверждения email при регистрации
const showPass    = ref(false)
const showNewPass = ref(false)
const remember    = ref(true)
const consentPersonalData = ref(false)
const consentCookies = ref(false)
const consentMarketingEmails = ref(false)
const mfaToken       = ref('')
const twoFactorMethod = ref<'totp' | 'email' | null>(null)
const twoFactorCode   = ref('')
const mounted     = ref(false)
const mouseX      = ref(50)
const mouseY      = ref(50)

// Мягкая подсказка про восстановление пароля после нескольких неудачных попыток
// (никакой блокировки — просто дружелюбный намёк вместо тишины)
const failedLoginAttempts = ref(0)
const FAILED_ATTEMPTS_HINT_THRESHOLD = 3

// Очистка кода от пробелов/переносов при вставке (в письме код визуально разбит по цифрам)
function sanitizeCodeInput(e: Event) {
  const target = e.target as HTMLInputElement
  const digits = target.value.replace(/\D+/g, '').slice(0, 6)
  target.value = digits
  return digits
}
function onOtpInput(e: Event) { otpCode.value = sanitizeCodeInput(e) }
function onResetCodeInput(e: Event) { resetCode.value = sanitizeCodeInput(e) }
function onTwoFactorCodeInput(e: Event) { twoFactorCode.value = sanitizeCodeInput(e) }

// Для повторной отправки OTP
const resendCountdown = ref(0)
let resendInterval: ReturnType<typeof setInterval> | null = null

function startResendTimer() {
  resendCountdown.value = 60
  resendInterval = setInterval(() => {
    resendCountdown.value--
    if (resendCountdown.value <= 0 && resendInterval) {
      clearInterval(resendInterval)
      resendInterval = null
    }
  }, 1000)
}

async function onResendOtp() {
  if (resendCountdown.value > 0) return
  try {
    await auth.resendOtp(email.value, mode.value === 'verify' ? 'register' : 'reset')
    startResendTimer()
  } catch { /* auth.error уже записан */ }
}

async function onResendTwoFactor() {
  if (resendCountdown.value > 0) return
  try {
    await auth.resendLoginTwoFactor(mfaToken.value)
    startResendTimer()
  } catch { /* auth.error уже записан */ }
}

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
  { val: statsLoaded.value ? fmtNum(statsData.value.users)  : '…', label: langStore.t.loginStatsUsers + '' },
  { val: statsLoaded.value ? fmtNum(statsData.value.posts)  : '…', label: langStore.t.tabPosts + '' },
  { val: statsLoaded.value ? fmtNum(statsData.value.online) : '…', label: langStore.t.onlineFilter + '' },
])

// ── Mount ─────────────────────────────────────────────────────────────────────
onMounted(() => {
  setTimeout(() => { mounted.value = true }, 60)
  loadStats()
  // OAuth-ошибка из redirect
  if (route.query.error) {
    const errMap: Record<string, string> = {
      oauth_denied: langStore.t.loginOauthDenied,
      oauth_failed: langStore.t.loginOauthFailed,
      account_banned: langStore.t.loginOauthBanned,
      account_frozen: langStore.t.loginOauthFrozen,
    }
    auth.error = errMap[route.query.error as string] ?? langStore.t.loginOauthError
  }
  // OAuth-вход с включённой 2FA — бэкенд прислал mfaToken вместо готовых токенов
  // (см. OAuthCallbackView.vue), продолжаем тем же экраном подтверждения кода,
  // что и при обычном логине по паролю.
  if (route.query.oauth2fa && route.query.mfaToken) {
    mfaToken.value = route.query.mfaToken as string
    twoFactorMethod.value = (route.query.method as 'totp' | 'email') ?? null
    mode.value = 'twofactor'
    if (twoFactorMethod.value === 'email') startResendTimer()
  }
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
  // Сохраняем email при переходе на шаги, где он уже введён
  if (next !== 'verify' && next !== 'reset') email.value = ''
  username.value = ''; password.value = ''
  newPassword.value = ''; resetCode.value = ''; otpCode.value = ''
  showPass.value = false; showNewPass.value = false
  mfaToken.value = ''; twoFactorMethod.value = null; twoFactorCode.value = ''
  if (next !== 'register') {
    consentPersonalData.value = false
    consentCookies.value = false
    consentMarketingEmails.value = false
  }
  failedLoginAttempts.value = 0
}

// ── OAuth ─────────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL ?? ''

function loginWith(provider: string) {
  // Метка «вход начат в этой вкладке»: колбэк без неё (чужая ссылка с #token=) не принимаем
  sessionStorage.setItem('oauth_started', '1')
  window.location.href = `${API_BASE}/api/auth/oauth/${provider}`
}

const oauthProviders = [
  // Яндекс первым — русский регион
  { id: 'yandex',  label: 'Яндекс', bg: '#fc3f1d', logo: `<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M14.155 4H12.25c-2.77 0-4.455 1.514-4.455 4.006 0 2.148 1.022 3.395 3.074 4.7L13 13.945 8.5 20H11l4.795-6.64-1.396-.894c-1.713-1.1-2.487-1.934-2.487-3.558C11.912 7.48 12.804 6.5 14.155 6.5V4zM14.5 4v16h2.5V4h-2.5z"/></svg>` },
  { id: 'google',  label: 'Google',  bg: '#fff', textColor: '#1a1a2e', border: 'rgba(255,255,255,0.15)', logo: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>` },
  { id: 'twitter', label: 'X',       bg: '#000', logo: `<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.258 5.63 5.907-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>` },
  { id: 'twitch',  label: 'Twitch',  bg: '#9146FF', logo: `<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>` },
]

// ── Submit handlers ───────────────────────────────────────────────────────────
async function onSubmit() {
  try {
    if (mode.value === 'login') {
      await auth.login(email.value, password.value, remember.value)
      failedLoginAttempts.value = 0
      router.push({ name: 'home' })
    } else if (mode.value === 'register') {
      if (!consentPersonalData.value || !consentCookies.value) {
        throw new Error('Для регистрации необходимо дать согласие на обработку персональных данных и использование cookie.')
      }
      await auth.register(email.value, username.value, password.value, {
        personalData: consentPersonalData.value,
        cookies: consentCookies.value,
        marketingEmails: consentMarketingEmails.value,
      })
      // Переходим на OTP-шаг (email не сбрасываем)
      mode.value = 'verify'
      auth.error = null
      startResendTimer()
    } else if (mode.value === 'verify') {
      await auth.verifyEmail(email.value, otpCode.value, remember.value)
      router.push({ name: 'home' })
    } else if (mode.value === 'forgot') {
      await auth.forgotPassword(email.value)
      switchMode('reset')
      startResendTimer()
    } else if (mode.value === 'reset') {
      await auth.resetPassword(email.value, resetCode.value, newPassword.value)
      switchMode('login')
    } else if (mode.value === 'twofactor') {
      await auth.verifyLoginTwoFactor(mfaToken.value, twoFactorCode.value, remember.value)
      router.push({ name: 'home' })
    }
  } catch (e: any) {
    const code = e?.response?.data?.error?.code
    // Email зарегистрирован, но не подтверждён → переводим на OTP-экран
    if (mode.value === 'login' && code === 'EMAIL_NOT_VERIFIED') {
      mode.value = 'verify'
      auth.error = null
      startResendTimer()
      auth.resendOtp(email.value, 'register').catch(() => {})
    } else if (mode.value === 'login' && code === 'ACCOUNT_FROZEN') {
      blockedReason.value = e?.response?.data?.error?.message || ''
      auth.error = null
      failedLoginAttempts.value = 0
      showFrozenModal.value = true
    } else if (mode.value === 'login' && code === 'ACCOUNT_BANNED') {
      blockedReason.value = e?.response?.data?.error?.message || ''
      auth.error = null
      failedLoginAttempts.value = 0
      showBannedModal.value = true
    } else if (mode.value === 'login' && code === 'TWO_FACTOR_REQUIRED') {
      mfaToken.value = e?.response?.data?.data?.mfaToken || ''
      twoFactorMethod.value = e?.response?.data?.data?.method || null
      mode.value = 'twofactor'
      auth.error = null
      failedLoginAttempts.value = 0
      if (twoFactorMethod.value === 'email') startResendTimer()
    } else if (mode.value === 'login' && code === 'AUTH_FAILED') {
      failedLoginAttempts.value++
    }
    /* auth.error уже записан в остальных случаях */
  }
}

function onUnfrozen() {
  showFrozenModal.value = false
  router.push({ name: 'home' })
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
const pwLabel = computed(() => {
  if (!activePassword.value) return ''
  if (activePassword.value.length < 8) return langStore.t.loginPasswordMinLength
  return ['', langStore.t.loginPwWeak, langStore.t.loginPwMedium, langStore.t.loginPwGood, langStore.t.loginPwExcellent][pwStrength.value]
})
const pwColor = computed(() => {
  if (activePassword.value && activePassword.value.length < 8) return '#E14664'
  return ['', '#E14664', '#E76F51', '#FFC01F', '#66C770'][pwStrength.value]
})

// Частицы
const particles = Array.from({ length: 80 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 0.8 + Math.random() * 2.2,
  dur: 3 + Math.random() * 6,
  delay: Math.random() * 8,
}))

const features = computed(() => [
  { icon: '⚡', title: langStore.t.loginFeatureFeedTitle, desc: langStore.t.loginFeatureFeedDesc },
  { icon: '🏆', title: langStore.t.loginFeatureBestTitle, desc: langStore.t.loginFeatureBestDesc },
  { icon: '🎨', title: langStore.t.loginFeatureMediaTitle, desc: langStore.t.loginFeatureMediaDesc },
])
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
            <span class="block text-white">{{ langStore.t.loginHeroLine1 }}</span>
            <span class="block hero-gradient">{{ langStore.t.loginHeroLine2 }}</span>
            <span class="block text-white/30">{{ langStore.t.loginHeroLine3 }}</span>
          </h1>

          <p class="text-lg text-white/45 leading-relaxed mb-12 max-w-sm font-medium">
            {{ langStore.t.loginHeroSubtitle }}
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
                      {{ mode === 'login'      ? langStore.t.loginHeading
                       : mode === 'register'   ? langStore.t.registerHeading
                       : mode === 'verify'     ? langStore.t.loginVerifyHeading
                       : mode === 'forgot'     ? langStore.t.loginForgotHeading
                       : mode === 'twofactor'  ? langStore.t.loginTwoFactorHeading
                       :                      langStore.t.loginResetHeading }}
                    </h2>
                    <p class="text-sm text-white/35 font-medium">
                      {{ mode === 'login'      ? langStore.t.loginSubheading
                       : mode === 'register'   ? langStore.t.loginRegisterSubheading
                       : mode === 'verify'     ? `${langStore.t.loginOtpSentPrefix} ${email || langStore.t.loginYourEmailFallback}.`
                       : mode === 'forgot'     ? langStore.t.loginForgotSubheading
                       : mode === 'twofactor'  ? (twoFactorMethod === 'totp' ? langStore.t.loginTwoFactorTotpHint : langStore.t.loginTwoFactorEmailHint)
                       :                      langStore.t.loginResetSubheading }}
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
                >{{ langStore.t.loginTab }}</button>
                <button
                  @click="switchMode('register')"
                  class="tab-btn"
                  :class="mode === 'register' ? 'text-white' : 'text-white/35 hover:text-white/60'"
                >{{ langStore.t.registerTab }}</button>
              </div>

              <!-- Кнопка назад для forgot/reset/verify/twofactor -->
              <button
                v-if="mode === 'forgot' || mode === 'reset' || mode === 'verify' || mode === 'twofactor'"
                @click="switchMode('login')"
                class="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/60 transition-colors mb-5 -mt-1"
              >
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/></svg>
                {{ mode === 'verify' ? langStore.t.loginChangeEmailBtn : langStore.t.loginBackToLoginBtn }}
              </button>

              <!-- ФОРМА -->
              <form @submit.prevent="onSubmit" class="space-y-3.5">

                <!-- Email (login / register / forgot / reset) -->
                <div v-if="mode !== 'verify' && mode !== 'twofactor'" class="input-group">
                  <EnvelopeIcon class="input-icon" />
                  <input
                    v-model="email"
                    type="email"
                    :placeholder="langStore.t.emailPlaceholder"
                    required
                    maxlength="254"
                    autocomplete="email"
                    class="fld"
                  />
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
                  <div v-if="mode === 'register'" class="space-y-1.5">
                    <div class="input-group overflow-hidden">
                      <UserIcon class="input-icon" />
                      <input :value="username" @input="username = ($event.target as HTMLInputElement).value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 30)" type="text" :placeholder="langStore.t.usernamePlaceholder" required minlength="3" maxlength="30" class="fld" autocomplete="username" autocorrect="off" autocapitalize="none" spellcheck="false" />
                    </div>
                    <p class="text-[11px] pl-1 transition-colors"
                      :class="username && username.length < 3 ? 'text-red-400/70' : 'text-white/30'">
                      <template v-if="!username">{{ langStore.t.loginUsernameHint }}</template>
                      <template v-else-if="username.length < 3">{{ langStore.t.loginUsernameNeedMore }} {{ 3 - username.length }} {{ langStore.t.loginUsernameCharsAbbrev }}</template>
                      <template v-else>{{ langStore.t.loginUsernameWillBe }} <span class="text-brand-accent/70 font-mono">{{ username }}</span></template>
                    </p>
                  </div>
                </Transition>

                <!-- Password (login / register) -->
                <div v-if="mode === 'login' || mode === 'register'" class="input-group">
                  <LockClosedIcon class="input-icon" />
                  <input
                    v-model="password"
                    :type="showPass ? 'text' : 'password'"
                    :placeholder="langStore.t.passwordPlaceholder"
                    required :minlength="mode === 'register' ? 8 : 1" maxlength="128"
                    :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
                    class="fld pr-12"
                  />
                  <button type="button" @click="showPass = !showPass"
                    class="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                    <component :is="showPass ? EyeSlashIcon : EyeIcon" class="w-[18px] h-[18px]" />
                  </button>
                </div>

                <div v-if="mode === 'register'" class="space-y-2.5 rounded-2xl border border-white/10 bg-white/3 p-3 text-left">
                  <label class="flex items-start gap-2.5 cursor-pointer text-xs text-white/75">
                    <input v-model="consentPersonalData" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-brand-accent focus:ring-brand-accent" required />
                    <span>
                      Я согласен на обработку моих персональных данных в соответствии с
                      <RouterLink to="/privacy" class="text-brand-accent hover:underline">Политикой конфиденциальности</RouterLink>.
                    </span>
                  </label>
                  <label class="flex items-start gap-2.5 cursor-pointer text-xs text-white/75">
                    <input v-model="consentCookies" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-brand-accent focus:ring-brand-accent" required />
                    <span>
                      Я согласен на использование cookie и аналогичных технологий, описанных в
                      <RouterLink to="/privacy" class="text-brand-accent hover:underline">Политике использования cookie</RouterLink>.
                    </span>
                  </label>
                  <label class="flex items-start gap-2.5 cursor-pointer text-xs text-white/65">
                    <input v-model="consentMarketingEmails" type="checkbox" class="mt-0.5 h-4 w-4 rounded border-white/20 bg-white/5 text-brand-accent focus:ring-brand-accent" />
                    <span>Я хочу получать новости и предложения по email (необязательно).</span>
                  </label>
                </div>

                <!-- Ссылка «Забыл пароль» (только login) -->
                <div v-if="mode === 'login'" class="flex justify-end -mt-1">
                  <button type="button" @click="switchMode('forgot')"
                    class="text-xs text-white/35 hover:text-brand-accent-minus transition-colors font-semibold">
                    {{ langStore.t.forgotPassword }}
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
                    <ComputerDesktopIcon class="w-3.5 h-3.5" />
                    {{ langStore.t.loginRememberDevice }}
                  </span>
                </label>

                <!-- Код сброса (режим reset) -->
                <div v-if="mode === 'reset'" class="input-group">
                  <KeyIcon class="input-icon" />
                  <input :value="resetCode" @input="onResetCodeInput" type="text" inputmode="numeric" :placeholder="langStore.t.loginSixDigitCodePlaceholder" required maxlength="20" pattern="[0-9]{6}" class="fld tracking-[0.3em] text-center" />
                </div>

                <!-- OTP для подтверждения email (режим verify) -->
                <div v-if="mode === 'verify'" class="space-y-3">
                  <!-- Информация куда отправлено -->
                  <div class="flex items-center gap-2.5 p-3.5 rounded-2xl bg-[#7c3aed]/10 border border-[#7c3aed]/25">
                    <ShieldCheckIcon class="w-4 h-4 shrink-0 text-[#a78bfa]" />
                    <p class="text-xs text-[#a78bfa] font-semibold">{{ langStore.t.loginCodeSentToLabel }} <span class="text-white">{{ email }}</span></p>
                  </div>
                  <div class="input-group">
                    <KeyIcon class="input-icon" />
                    <input
                      :value="otpCode"
                      @input="onOtpInput"
                      type="text"
                      inputmode="numeric"
                      placeholder="• • • • • •"
                      required maxlength="20" pattern="[0-9]{6}"
                      class="fld tracking-[0.5em] text-center text-xl font-bold"
                      autocomplete="one-time-code"
                    />
                  </div>
                  <!-- Повторная отправка -->
                  <div class="flex justify-end">
                    <button
                      type="button"
                      @click="onResendOtp"
                      :disabled="resendCountdown > 0"
                      class="text-xs font-semibold transition-colors"
                      :class="resendCountdown > 0 ? 'text-white/20 cursor-default' : 'text-[#a78bfa] hover:text-white'"
                    >
                      {{ resendCountdown > 0 ? `${langStore.t.loginResendIn} ${resendCountdown}${langStore.t.loginSecondsAbbrev}` : langStore.t.loginResendCode }}
                    </button>
                  </div>
                </div>

                <!-- Код второго фактора (режим twofactor) -->
                <div v-if="mode === 'twofactor'" class="space-y-3">
                  <div class="flex items-center gap-2.5 p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25">
                    <ShieldCheckIcon class="w-4 h-4 shrink-0 text-emerald-400" />
                    <p class="text-xs text-emerald-400 font-semibold">
                      {{ twoFactorMethod === 'totp' ? langStore.t.loginTwoFactorTotpCodeLabel : `${langStore.t.loginCodeSentToLabel} ${email || langStore.t.loginYourEmailFallback}` }}
                    </p>
                  </div>
                  <div class="input-group">
                    <KeyIcon class="input-icon" />
                    <input
                      :value="twoFactorCode"
                      @input="onTwoFactorCodeInput"
                      type="text"
                      inputmode="numeric"
                      placeholder="• • • • • •"
                      required maxlength="20" pattern="[0-9]{6}"
                      class="fld tracking-[0.5em] text-center text-xl font-bold"
                      autocomplete="one-time-code"
                    />
                  </div>
                  <!-- Повторная отправка (только для email-метода) -->
                  <div v-if="twoFactorMethod === 'email'" class="flex justify-end">
                    <button
                      type="button"
                      @click="onResendTwoFactor"
                      :disabled="resendCountdown > 0"
                      class="text-xs font-semibold transition-colors"
                      :class="resendCountdown > 0 ? 'text-white/20 cursor-default' : 'text-emerald-400 hover:text-white'"
                    >
                      {{ resendCountdown > 0 ? `${langStore.t.loginResendIn} ${resendCountdown}${langStore.t.loginSecondsAbbrev}` : langStore.t.loginResendCode }}
                    </button>
                  </div>
                </div>

                <!-- Новый пароль (режим reset) -->
                <div v-if="mode === 'reset'" class="input-group">
                  <LockClosedIcon class="input-icon" />
                  <input
                    v-model="newPassword"
                    :type="showNewPass ? 'text' : 'password'"
                    :placeholder="langStore.t.newPasswordLabel"
                    required minlength="8" maxlength="128"
                    autocomplete="new-password"
                    class="fld pr-12"
                  />
                  <button type="button" @click="showNewPass = !showNewPass"
                    class="absolute right-4 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors">
                    <component :is="showNewPass ? EyeSlashIcon : EyeIcon" class="w-[18px] h-[18px]" />
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
                  <CheckCircleIcon class="w-4 h-4 shrink-0 mt-0.5 text-green-400" />
                  <p class="text-xs text-green-400 font-semibold">{{ langStore.t.loginCodeSentToLabel }} {{ email || langStore.t.loginYourEmailFormalFallback }}. {{ langStore.t.loginCheckYourEmail }}</p>
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

                <!-- Мягкая подсказка после нескольких неудачных попыток входа -->
                <Transition
                  enter-active-class="transition-all duration-300"
                  enter-from-class="opacity-0 -translate-y-1 scale-[0.98]"
                  enter-to-class="opacity-100 translate-y-0 scale-100"
                  leave-active-class="transition-all duration-200"
                  leave-to-class="opacity-0 scale-[0.98]"
                >
                  <div v-if="mode === 'login' && failedLoginAttempts >= FAILED_ATTEMPTS_HINT_THRESHOLD"
                    class="flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-500/8 border border-amber-500/20">
                    <KeyIcon class="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div class="flex-1">
                      <p class="text-xs text-amber-300/90 font-semibold">{{ langStore.t.loginTroubleHint }}</p>
                      <button type="button" @click="switchMode('forgot')"
                        class="text-xs font-bold text-amber-300 hover:text-amber-200 underline underline-offset-2 mt-1">
                        {{ langStore.t.loginRestorePasswordBtn }}
                      </button>
                    </div>
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
                    {{ langStore.t.loadingBtn }}
                  </span>
                  <span v-else class="flex items-center justify-center gap-2.5 relative z-10">
                    {{ mode === 'login'      ? langStore.t.submitLogin
                     : mode === 'register'   ? langStore.t.submitRegister
                     : mode === 'verify'     ? langStore.t.loginConfirmEmailBtn
                     : mode === 'forgot'     ? langStore.t.sendCodeBtn
                     : mode === 'twofactor'  ? langStore.t.loginConfirmLoginBtn
                     :                      langStore.t.changePasswordBtn }}
                    <ArrowRightIcon class="w-5 h-5" />
                  </span>
                </button>
              </form>

              <!-- ── OAuth кнопки (только login/register) ── -->
              <div v-if="mode === 'login' || mode === 'register'" class="mt-5">
                <div class="flex items-center gap-3 mb-4">
                  <div class="flex-1 h-px bg-white/8"></div>
                  <span class="text-[11px] text-white/25 font-semibold uppercase tracking-widest shrink-0">{{ langStore.t.loginOrContinueWith }}</span>
                  <div class="flex-1 h-px bg-white/8"></div>
                </div>

                <!-- Яндекс — крупная кнопка (русский регион) -->
                <button
                  type="button"
                  @click="loginWith('yandex')"
                  class="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-2xl font-bold text-sm text-white mb-2 transition-all duration-200 hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]"
                  style="background:#fc3f1d"
                >
                  <span class="w-5 h-5" v-html="oauthProviders[0].logo"></span>
                  {{ langStore.t.loginContinueWithPrefix }} Яндекс
                </button>

                <!-- Остальные провайдеры — сетка -->
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="p in oauthProviders.slice(1)" :key="p.id"
                    type="button"
                    @click="loginWith(p.id)"
                    class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
                    :style="{
                      background: p.bg,
                      color: p.textColor ?? 'white',
                      border: p.border ? `1px solid ${p.border}` : undefined,
                    }"
                    :title="`${langStore.t.loginContinueWithPrefix} ${p.label}`"
                  >
                    <span class="w-4 h-4 shrink-0" v-html="p.logo"></span>
                    <span>{{ p.label }}</span>
                  </button>
                </div>
              </div>

              <!-- Footer links -->
              <p class="mt-6 text-center text-xs text-white/20 leading-relaxed">
                {{ langStore.t.loginTermsAgreePrefix }}
                <RouterLink to="/terms" class="text-white/40 hover:text-brand-accent-minus underline-offset-2 hover:underline transition-colors">{{ langStore.t.termsTitle }}</RouterLink>
                {{ langStore.t.loginTermsAnd }}
                <RouterLink to="/privacy" class="text-white/40 hover:text-brand-accent-minus underline-offset-2 hover:underline transition-colors">{{ langStore.t.privacyTitle }}</RouterLink>
              </p>
            </div>
          </div>

          <!-- Декоративная подсветка снизу -->
          <div class="h-px mt-3 w-2/3 mx-auto bg-gradient-to-r from-transparent via-brand-accent/40 to-transparent blur-sm"></div>
        </div>
      </div>
    </div>

    <FrozenAccountModal
      :show="showFrozenModal"
      :email="email"
      :reason="blockedReason"
      :remember="remember"
      @close="showFrozenModal = false"
      @unfrozen="onUnfrozen"
    />
    <BannedAccountModal
      :show="showBannedModal"
      :reason="blockedReason"
      :email="email"
      :password="password"
      @close="showBannedModal = false"
    />
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
