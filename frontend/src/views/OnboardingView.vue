<template>
  <div class="page-root font-nunito text-white overflow-hidden">

    <!-- ══ MESH AURORA BACKGROUND ══ -->
    <div class="absolute inset-0 pointer-events-none overflow-hidden">
      <div class="mesh-bg absolute inset-0"></div>
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
      <div class="grid-overlay absolute inset-0 opacity-[0.025]"></div>
    </div>

    <!-- ══ CONTENT ══ -->
    <div class="relative z-10 min-h-screen w-full flex flex-col items-center justify-center px-4 py-10">

      <!-- Логотип -->
      <div
        class="flex items-center gap-3 mb-8 transition-all duration-700"
        :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'"
      >
        <div class="w-10 h-10 rounded-2xl bg-brand-accent/20 border border-brand-accent/30 flex items-center justify-center shadow-[0_0_24px_rgba(76,103,207,0.4)]">
          <img src="/bloomly.png?v=2" alt="Bloomly" class="w-7 h-7 object-contain" />
        </div>
        <span class="text-xl font-black hero-gradient">Bloomly</span>
        <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/8 border border-white/12 text-[10px] font-bold text-white/50 ml-1">
          <span class="w-1.5 h-1.5 rounded-full bg-brand-yellow shadow-[0_0_6px_#FFC01F] animate-pulse"></span>
          Beta
        </div>
      </div>

      <!-- ══ КАРТОЧКА ══ -->
      <div
        class="onboarding-card w-full max-w-lg transition-all duration-700 delay-150"
        :class="mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'"
      >
        <!-- Живая гало-подсветка -->
        <div
          class="card-glow pointer-events-none"
          :style="{
            background: `radial-gradient(320px circle at ${mouseX}% ${mouseY}%, rgba(76,103,207,0.16) 0%, transparent 70%)`,
          }"
        ></div>

        <div class="card-body">

          <!-- ══ ШАГ 1: Основное ══ -->
          <Transition name="slide" mode="out-in">
            <div v-if="step === 1" key="step1">
              <div class="step-header">
                <div class="step-icon">👋</div>
                <div>
                  <h2 class="step-title">{{ langStore.t.onboardingStep1Title }}</h2>
                  <p class="step-desc">{{ langStore.t.onboardingStep1Desc }}</p>
                </div>
              </div>

              <div class="stack-y-4">
                <!-- Отображаемое имя -->
                <div>
                  <label class="field-label">{{ langStore.t.displayNameLabel }} <span class="text-brand-accent">*</span></label>
                  <div class="input-group">
                    <svg class="input-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    <input
                      v-model="form.display_name"
                      maxlength="50"
                      :placeholder="langStore.t.onboardingNamePlaceholder"
                      class="fld"
                      autofocus
                    />
                  </div>
                  <p class="field-hint text-right">{{ form.display_name.length }}/50</p>
                </div>

                <!-- Дата рождения -->
                <div>
                  <label class="field-label">{{ langStore.t.birthdayLabel }}</label>
                  <DateInput ref="birthDateInputRef" v-model="form.birth_date"
                    :max="new Date().toISOString().substring(0,10)"
                    @invalid="birthDateInvalid = $event" />
                  <p class="field-hint"
                    :class="birthAge !== null && birthAge < 18 ? 'text-brand-error/80!' : ''">
                    <template v-if="birthAge !== null">
                      {{ ageLabel(birthAge) }}
                      <span v-if="birthAge < 18"> · {{ langStore.t.nsfwUnder18Hint }}</span>
                    </template>
                    <template v-else>{{ langStore.t.nsfwBirthdayHint }}</template>
                  </p>
                </div>
              </div>
            </div>
          </Transition>

          <!-- ══ ШАГ 4: Готово ══ -->
          <Transition name="slide" mode="out-in">
            <div v-if="step === 2" key="step4" class="text-center py-6">
              <div class="relative inline-flex items-center justify-center w-24 h-24 mb-6">
                <div class="absolute inset-0 rounded-full bg-brand-accent/20 border border-brand-accent/30 animate-pulse"></div>
                <div class="absolute inset-3 rounded-full bg-brand-accent/10 border border-brand-accent/20"></div>
                <span class="relative text-5xl">🌸</span>
              </div>
              <h2 class="text-3xl font-black text-white mb-2">{{ langStore.t.onboardingAllDoneTitle }}</h2>
              <p class="text-white/50 text-sm mb-1">
                {{ langStore.t.onboardingWelcomePrefix }} <span class="hero-gradient font-black">{{ form.display_name || auth.user?.username }}</span>!
              </p>
              <p class="text-white/25 text-xs">{{ langStore.t.onboardingSavingProfile }}</p>
              <div v-if="saveError" class="mt-5 flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-500/8 border border-red-500/20">
                <svg class="w-4 h-4 shrink-0 mt-0.5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
                <p class="text-sm text-red-400 font-semibold">{{ saveError }}</p>
              </div>
            </div>
          </Transition>

          <!-- Ошибка валидации -->
          <Transition
            enter-active-class="transition-all duration-300"
            enter-from-class="opacity-0 -translate-y-1"
            enter-to-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0"
          >
            <div v-if="validationError" class="flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-500/8 border border-red-500/20 mt-4">
              <svg class="w-4 h-4 shrink-0 mt-0.5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
              <p class="text-sm text-red-400 font-semibold">{{ validationError }}</p>
            </div>
          </Transition>

          <!-- ══ НАВИГАЦИЯ ══ -->
          <div v-if="step < 2" class="flex items-center justify-end mt-7 pt-5 border-t border-white/6">
            <button
              @click="nextStep"
              :disabled="isLoading"
              class="cta-btn"
            >
              <span class="cta-shimmer"></span>
              <span v-if="isLoading" class="flex items-center gap-2 relative z-10">
                <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/></svg>
                {{ langStore.t.savingProfile }}
              </span>
              <span v-else class="relative z-10">{{ langStore.t.onboardingFinishBtn }}</span>
            </button>
          </div>

          <!-- Retry при ошибке на шаге 4 -->
          <div v-if="step === 2 && saveError" class="flex justify-center mt-4">
            <button @click="saveProfile" class="cta-btn">
              <span class="cta-shimmer"></span>
              <span class="relative z-10">{{ langStore.t.onboardingRetryBtn }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Пропустить всё -->
      <button
        v-if="step < 2"
        @click="skipAll"
        class="mt-5 text-xs text-white/18 hover:text-white/40 transition-colors font-semibold"
      >
        {{ langStore.t.onboardingSkipAllBtn }}
      </button>

      <!-- Декоративная линия снизу -->
      <div class="h-px mt-4 w-32 mx-auto bg-linear-to-r/srgb from-transparent via-brand-accent/30 to-transparent blur-xs"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { apiErrorMessage, errorMessage } from '@/lib/apiError'
import { useLangStore } from '@/stores/lang'
const langStore = useLangStore()
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import api from '@/api'
import DateInput from '@/components/DateInput.vue'

const router = useRouter()
const auth   = useAuthStore()
const mounted = ref(false)
const mouseX  = ref(50)
const mouseY  = ref(50)

const TOTAL_STEPS = 2
const step     = ref(1)
const isLoading   = ref(false)
const saveError   = ref<string | null>(null)
const validationError = ref<string | null>(null)
const birthDateInputRef = ref<InstanceType<typeof DateInput> | null>(null)
const birthDateInvalid  = ref(false)

const form = ref({
  display_name: auth.user?.display_name ?? '',
  birth_date:   null as string | null,
})

const particles = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  x: Math.random() * 100,
  y: Math.random() * 100,
  size: 0.8 + Math.random() * 1.8,
  dur: 3 + Math.random() * 6,
  delay: Math.random() * 8,
}))

onMounted(() => {
  setTimeout(() => { mounted.value = true }, 60)
  if (auth.user?.onboarding_done) {
    router.push({ name: 'home' })
  }
  const card = document.querySelector('.onboarding-card') as HTMLElement | null
  if (card) {
    card.addEventListener('mousemove', (e: MouseEvent) => {
      const r = card.getBoundingClientRect()
      mouseX.value = ((e.clientX - r.left) / r.width) * 100
      mouseY.value = ((e.clientY - r.top) / r.height) * 100
    })
    card.addEventListener('mouseleave', () => { mouseX.value = 50; mouseY.value = 50 })
  }
})

const birthAge = computed<number | null>(() => {
  if (!form.value.birth_date) return null
  const [y, mo, d] = form.value.birth_date.split('-').map(Number)
  const now = new Date()
  let age = now.getFullYear() - y
  const m = now.getMonth() + 1 - mo
  if (m < 0 || (m === 0 && now.getDate() < d)) age--
  return age
})

function ageLabel(n: number): string {
  if (langStore.currentLang === 'RU') {
    const word = n % 10 === 1 && n % 100 !== 11 ? 'год'
      : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'года'
      : 'лет'
    return `${n} ${word}`
  }
  if (langStore.currentLang === 'JP' || langStore.currentLang === 'CN') return `${n}${langStore.t.yearsOldSuffix}`
  return `${n} ${langStore.t.yearsOldSuffix}`
}

function validate(): boolean {
  validationError.value = null
  if (step.value === 1) {
    if (!form.value.display_name.trim()) {
      validationError.value = langStore.t.onboardingNameRequiredError
      return false
    }
    if (birthDateInvalid.value) {
      birthDateInputRef.value?.shake()
      validationError.value = langStore.t.onboardingBirthDateError
      return false
    }
  }
  return true
}

function nextStep() {
  if (!validate()) return
  saveProfile()
}

async function saveProfile() {
  isLoading.value  = true
  saveError.value  = null
  step.value       = TOTAL_STEPS

  try {
    const payload: Record<string, any> = { onboarding_done: true }
    if (form.value.display_name.trim()) payload.display_name = form.value.display_name.trim()
    if (form.value.birth_date) payload.birth_date = form.value.birth_date

    const { data } = await api.patch('/users/me', payload)
    if (!data.success) throw new Error(langStore.t.onboardingSaveFailedError)

    auth.user = { ...auth.user!, ...data.data.user, onboarding_done: true }
    const stored = localStorage.getItem('auth_user') ? localStorage : sessionStorage
    stored.setItem('auth_user', JSON.stringify(auth.user))

    await new Promise((r) => setTimeout(r, 1200))
    router.push({ name: 'home' })
  } catch (e) {
    saveError.value = apiErrorMessage(e) || errorMessage(e) || langStore.t.onboardingSaveErrorGeneric
  } finally {
    isLoading.value = false
  }
}

async function skipAll() {
  try {
    await api.patch('/users/me', { onboarding_done: true })
    auth.user = { ...auth.user!, onboarding_done: true }
    const stored = localStorage.getItem('auth_user') ? localStorage : sessionStorage
    stored.setItem('auth_user', JSON.stringify(auth.user))
  } catch { /* ignore */ }
  router.push({ name: 'home' })
}
</script>

<style scoped>
/* ══ ROOT ══ */
.page-root {
  position: relative;
  min-height: 100svh;
  background: #080b1a;
}

/* ══ MESH BG ══ */
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

/* ══ GRID OVERLAY ══ */
.grid-overlay {
  background-image:
    linear-gradient(rgba(255,255,255,1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px);
  background-size: 48px 48px;
}

/* ══ PARTICLES ══ */
@keyframes pFloat {
  0%   { opacity: 0.05; transform: translateY(0) scale(1); }
  50%  { opacity: 0.45; }
  100% { opacity: 0.08; transform: translateY(-20px) scale(1.3); }
}

/* ══ HERO GRADIENT ══ */
.hero-gradient {
  background: linear-gradient(135deg, #7B9CFF 0%, #CD83F5 50%, #F7A9E2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* ══ ONBOARDING CARD ══ */
.onboarding-card {
  position: relative;
  border-radius: 28px;
  background: rgba(12, 15, 32, 0.82);
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
.onboarding-card:hover {
  box-shadow:
    0 0 0 1px rgba(76,103,207,0.22),
    0 40px 80px rgba(0,0,0,0.55),
    0 12px 32px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.07);
}

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

/* ══ STEP HEADER ══ */
.step-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
}
.step-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 18px;
  background: rgba(76,103,207,0.15);
  border: 1px solid rgba(76,103,207,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.step-title {
  font-size: 22px;
  font-weight: 900;
  color: white;
  line-height: 1.1;
  margin-bottom: 3px;
}
.step-desc {
  font-size: 13px;
  color: rgba(255,255,255,0.35);
  font-weight: 500;
}

/* ══ FIELD LABEL ══ */
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 700;
  color: rgba(255,255,255,0.45);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}
.field-hint {
  font-size: 11px;
  color: rgba(255,255,255,0.2);
  margin-top: 4px;
}

/* ══ INPUT GROUP ══ */
.input-group {
  position: relative;
  display: flex;
  align-items: center;
}
.input-icon {
  position: absolute;
  left: 16px;
  width: 16px;
  height: 16px;
  color: rgba(255,255,255,0.22);
  pointer-events: none;
  flex-shrink: 0;
  z-index: 1;
  transition: color 0.2s;
}
.input-group:focus-within .input-icon {
  color: rgba(163,184,255,0.7);
}
.fld {
  width: 100%;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 13px 16px 13px 44px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  outline: none;
  transition: all 0.2s ease;
  caret-color: #7b9cff;
}
.fld::placeholder { color: rgba(255,255,255,0.2); font-weight: 500; }
.fld:focus {
  border-color: rgba(76,103,207,0.6);
  background: rgba(76,103,207,0.07);
  box-shadow: 0 0 0 3px rgba(76,103,207,0.15), inset 0 1px 0 rgba(255,255,255,0.04);
}

/* ══ TEXTAREA ══ */
.textarea-group { position: relative; }
.fld-textarea {
  width: 100%;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 13px 16px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  outline: none;
  transition: all 0.2s ease;
  caret-color: #7b9cff;
  resize: none;
  line-height: 1.6;
}
.fld-textarea::placeholder { color: rgba(255,255,255,0.2); }
.fld-textarea:focus {
  border-color: rgba(76,103,207,0.6);
  background: rgba(76,103,207,0.07);
  box-shadow: 0 0 0 3px rgba(76,103,207,0.15);
}

/* ══ CHIPS ══ */
.chip {
  font-size: 12px;
  font-weight: 700;
  padding: 7px 14px;
  border-radius: 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.45);
  transition: all 0.2s ease;
  cursor: pointer;
}
.chip:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
.chip--active {
  background: rgba(76,103,207,0.25);
  border-color: rgba(76,103,207,0.55);
  color: rgba(163,184,255,0.95);
  box-shadow: 0 0 12px rgba(76,103,207,0.2);
}

/* ══ SPECIES GRID ══ */
.species-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.species-chip {
  font-size: 12px;
  font-weight: 700;
  padding: 6px 12px;
  border-radius: 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.45);
  transition: all 0.2s ease;
  cursor: pointer;
}
.species-chip:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
.species-chip--active {
  background: rgba(168,85,247,0.22);
  border-color: rgba(168,85,247,0.5);
  color: rgba(216,180,254,0.95);
  box-shadow: 0 0 12px rgba(168,85,247,0.2);
}

/* ══ COLOR PICKER ══ */
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.color-swatch-wrap {
  flex-shrink: 0;
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s;
  gap: 4px;
  flex-direction: column;
}
.color-swatch-wrap:hover { border-color: rgba(76,103,207,0.5); }
.color-swatch {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.15);
  flex-shrink: 0;
}
.color-input-hidden {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}
.preset-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.15);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}
.preset-dot:hover { transform: scale(1.2); border-color: rgba(255,255,255,0.5); }

/* ══ INTEREST CHIPS ══ */
.interest-chip {
  font-size: 12px;
  font-weight: 700;
  padding: 7px 13px;
  border-radius: 12px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.45);
  transition: all 0.2s ease;
  cursor: pointer;
  white-space: nowrap;
}
.interest-chip:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
.interest-chip--active {
  background: rgba(76,103,207,0.22);
  border-color: rgba(76,103,207,0.5);
  color: rgba(163,184,255,0.95);
  box-shadow: 0 0 10px rgba(76,103,207,0.18);
}

/* ══ CTA BUTTON ══ */
.cta-btn {
  position: relative;
  padding: 12px 24px;
  border-radius: 16px;
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: white;
  overflow: hidden;
  transition: all 0.25s ease;
  background: linear-gradient(135deg, #3d56c4 0%, #6057cc 50%, #7B4FD0 100%);
  box-shadow:
    0 6px 20px rgba(76,103,207,0.45),
    0 2px 6px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.15);
}
.cta-btn:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow:
    0 10px 28px rgba(76,103,207,0.6),
    0 4px 10px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.18);
}
.cta-btn:not(:disabled):active { transform: translateY(0) scale(0.97); }
.cta-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.cta-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.16) 50%, transparent 70%);
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

/* ══ SLIDE TRANSITION ══ */
.slide-enter-active { transition: all 0.3s cubic-bezier(.4,0,.2,1); }
.slide-leave-active { transition: all 0.2s cubic-bezier(.4,0,.2,1); }
.slide-enter-from { opacity: 0; transform: translateX(16px); }
.slide-leave-to  { opacity: 0; transform: translateX(-16px); }

/* ══ SCROLLBAR ══ */
.custom-scroll::-webkit-scrollbar { width: 4px; }
.custom-scroll::-webkit-scrollbar-track { background: transparent; }
.custom-scroll::-webkit-scrollbar-thumb { background: rgba(76,103,207,0.35); border-radius: 9999px; }
</style>
