<script setup lang="ts">
// Донат на развитие проекта: оплата через ЮKassa (страница оплаты), итог — на /payment/result
import { ref, computed, onMounted } from 'vue'
import { useLangStore } from '@/stores/lang'
import { usePaymentsStore } from '@/stores/payments'
import { apiErrorMessage } from '@/lib/apiError'
import AppHeader from '@/components/AppHeader.vue'
import BIcon from '@/components/BIcon.vue'

const langStore = useLangStore()
const payments = usePaymentsStore()

const PRESETS = [
  { v: 500, icon: 'Flower2' },
  { v: 1000, icon: 'Star' },
  { v: 2000, icon: 'Zap' },
  { v: 3000, icon: 'Rocket' },
  { v: 5000, icon: 'Crown' },
]

// Тексты, которых нет в общих словарях: RU и EN, остальные языки показывают EN
const COPY = {
  RU: {
    badge: 'Независимый проект',
    goes: 'Куда идёт поддержка',
    servers: ['Серверы', 'Стабильная работа и быстрая загрузка'],
    dev: ['Разработка', 'Новые функции и исправления'],
    safety: ['Безопасность', 'Модерация и защита аккаунтов'],
    secure: 'Безопасная оплата через ЮKassa',
    thanks: 'Спасибо, что вы с нами',
  },
  EN: {
    badge: 'Independent project',
    goes: 'Where your support goes',
    servers: ['Servers', 'Reliable service and fast loading'],
    dev: ['Development', 'New features and fixes'],
    safety: ['Safety', 'Moderation and account protection'],
    secure: 'Secure payment via YooKassa',
    thanks: 'Thank you for being with us',
  },
} as const
const copy = computed(() => langStore.currentLang === 'RU' ? COPY.RU : COPY.EN)
const goesTo = computed(() => [
  { icon: 'Server', text: copy.value.servers, tone: 'text-brand-accent-minus bg-brand-accent/15' },
  { icon: 'Palette', text: copy.value.dev, tone: 'text-brand-yellow bg-brand-yellow/10' },
  { icon: 'ShieldCheck', text: copy.value.safety, tone: 'text-brand-success bg-brand-success/10' },
])
const amount = ref<number | null>(500)
const custom = ref<number | null>(null)
const sending = ref(false)
const errorMsg = ref('')

const limits = computed(() => payments.config?.donate ?? { min: 500, max: 50000 })
const enabled = computed(() => payments.config?.enabled ?? false)
const valid = computed(() => Number.isInteger(amount.value) && amount.value! >= limits.value.min && amount.value! <= limits.value.max)

function pick(v: number) { amount.value = v; custom.value = null }
function onCustom() { amount.value = custom.value }

async function donate() {
  if (!valid.value || sending.value) return
  sending.value = true
  errorMsg.value = ''
  try {
    await payments.startDonation(amount.value!, 'AC') // откроется страница оплаты ЮKassa
  } catch (e) {
    errorMsg.value = apiErrorMessage(e) || langStore.t.subToastError
    sending.value = false
  }
}

onMounted(() => { payments.fetchConfig().catch(() => {}) })
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-brand-offwhite font-nunito relative overflow-hidden">
    <!-- Фон: мягкие дрейфующие свечения и сетка точек -->
    <div class="pointer-events-none absolute inset-0 support-dots"></div>
    <div class="pointer-events-none absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-brand-accent/25 blur-3xl support-drift"></div>
    <div class="pointer-events-none absolute top-40 -right-32 w-[460px] h-[460px] rounded-full bg-brand-purple/15 blur-3xl support-drift-rev"></div>
    <div class="pointer-events-none absolute bottom-0 left-1/3 w-[420px] h-[420px] rounded-full bg-brand-pink/10 blur-3xl support-drift"></div>

    <AppHeader />

    <main class="relative max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-20">
      <div class="grid gap-8 lg:grid-cols-5 lg:items-start">
        <!-- Левая колонка: герой -->
        <section class="lg:col-span-2 text-center lg:text-left stack-y-6 lg:pt-8">
          <div class="relative inline-flex">
            <span class="absolute inset-0 rounded-3xl bg-brand-accent/40 blur-2xl support-pulse"></span>
            <div class="relative inline-flex items-center justify-center w-24 h-24 rounded-[28px] bg-linear-to-br/srgb from-brand-card to-brand-accent-plus-plus border border-brand-border shadow-xl shadow-brand-accent/30 support-float">
              <img src="/bloomly.png?v=2" alt="Bloomly" class="w-14 h-14 object-contain" />
            </div>
            <span class="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-brand-pink flex items-center justify-center shadow-lg shadow-brand-pink/30 border-4 border-brand-bg">
              <BIcon name="Heart" class="w-4 h-4 text-brand-accent-plus-plus fill-current" />
            </span>
          </div>

          <div class="stack-y-4">
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-accent/15 border border-brand-accent/30 text-[11px] font-bold uppercase tracking-wider text-brand-accent-minus">
              <BIcon name="Sparkles" class="w-3.5 h-3.5" /> {{ copy.badge }}
            </span>
            <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.08] bg-linear-to-r/srgb from-white via-brand-accent-minus-minus to-brand-pink bg-clip-text text-transparent">
              {{ langStore.t.supportProject }}
            </h1>
            <p class="text-sm sm:text-base text-white/65 leading-relaxed max-w-md mx-auto lg:mx-0">{{ langStore.t.supportDesc }}</p>
          </div>

          <!-- Куда идёт поддержка -->
          <div class="hidden lg:block stack-y-3 pt-2">
            <p class="text-xs font-bold text-white/40 uppercase tracking-wider">{{ copy.goes }}</p>
            <div v-for="g in goesTo" :key="g.icon"
              class="flex items-center gap-3 p-3 rounded-2xl bg-brand-card/60 border border-brand-border/70 backdrop-blur-sm transition hover:border-brand-muted hover:bg-brand-card/90">
              <span class="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" :class="g.tone">
                <BIcon :name="g.icon" class="w-5 h-5" />
              </span>
              <div class="min-w-0">
                <p class="text-sm font-bold leading-tight">{{ g.text[0] }}</p>
                <p class="text-xs text-white/50 leading-snug">{{ g.text[1] }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Правая колонка: форма доната -->
        <section class="lg:col-span-3 relative">
          <!-- Градиентная рамка -->
          <div class="absolute -inset-px rounded-[28px] bg-linear-to-br/srgb from-brand-accent/60 via-brand-border to-brand-pink/40 opacity-70"></div>
          <div class="relative rounded-[28px] bg-brand-card/95 backdrop-blur-md shadow-2xl shadow-black/40 p-5 sm:p-8 stack-y-6">
            <!-- Способ оплаты -->
            <div class="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-brand-bg/80 border border-brand-border text-sm font-bold text-white/70">
              <BIcon name="CreditCard" class="w-4 h-4 text-brand-accent-minus" /> {{ langStore.t.payMethodOnline }}
            </div>

            <!-- Сумма -->
            <div class="stack-y-3">
              <p class="text-xs font-bold text-white/45 uppercase tracking-wider">{{ langStore.t.supportAmount }}</p>
              <div class="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
                <button v-for="p in PRESETS" :key="p.v" @click="pick(p.v)" type="button"
                  class="group relative flex flex-col items-center gap-1.5 pt-3.5 pb-3 rounded-2xl border transition-all duration-200"
                  :class="amount === p.v && custom === null
                    ? 'border-brand-accent bg-linear-to-b/srgb from-brand-accent/30 to-brand-accent/10 text-white shadow-lg shadow-brand-accent/25 -translate-y-1'
                    : 'border-brand-border bg-brand-bg/60 text-white/60 hover:text-white hover:border-brand-muted hover:-translate-y-0.5'">
                  <BIcon :name="p.icon" class="w-5 h-5 transition-transform group-hover:scale-110"
                    :class="amount === p.v && custom === null ? 'text-brand-yellow' : 'text-white/35 group-hover:text-brand-accent-minus'" />
                  <span class="text-sm font-extrabold tabular-nums">{{ p.v }} <span class="text-[10px] font-semibold opacity-70">₽</span></span>
                  <span v-if="amount === p.v && custom === null"
                    class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-brand-accent flex items-center justify-center border-2 border-brand-card">
                    <BIcon name="Check" class="w-3 h-3 text-white stroke-[3px]" />
                  </span>
                </button>
              </div>
              <div class="relative">
                <input v-model.number="custom" @input="onCustom" type="number" inputmode="numeric" step="1"
                  :min="limits.min" :max="limits.max"
                  :placeholder="`${langStore.t.supportCustom} (${limits.min}–${limits.max})`"
                  class="w-full pl-4 pr-10 py-3.5 rounded-2xl bg-brand-bg border border-brand-border text-sm outline-hidden transition focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/15"
                  :class="custom !== null && 'border-brand-accent/60'" />
                <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-white/40">₽</span>
              </div>
            </div>

            <!-- Итог -->
            <div class="relative overflow-hidden rounded-2xl bg-brand-bg/70 border border-brand-border p-4 flex items-center justify-between gap-4">
              <div class="absolute inset-0 bg-linear-to-r/srgb from-brand-accent/10 to-transparent"></div>
              <span class="relative flex items-center gap-2 text-sm text-white/55">
                <BIcon name="Heart" class="w-4 h-4 text-brand-pink fill-current" /> {{ langStore.t.supportProject }}
              </span>
              <span class="relative text-3xl font-extrabold tabular-nums">
                <template v-if="valid">{{ amount }} <span class="text-lg text-white/50">₽</span></template>
                <template v-else>—</template>
              </span>
            </div>

            <p v-if="payments.config && !enabled" class="text-xs text-amber-400 text-center">{{ langStore.t.supportDisabled }}</p>
            <p v-if="errorMsg" class="text-xs text-brand-error text-center">{{ errorMsg }}</p>

            <button :disabled="!valid || !enabled || sending" @click="donate" type="button"
              class="relative overflow-hidden w-full py-4 rounded-2xl bg-linear-to-r/srgb from-brand-accent to-brand-purple text-sm sm:text-base font-extrabold text-white shadow-lg shadow-brand-accent/35 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0 transition-all support-shine">
              <span class="relative inline-flex items-center justify-center gap-2">
                <BIcon name="Heart" class="w-4 h-4 fill-current" />
                {{ langStore.t.supportDonate }}<template v-if="valid"> · {{ amount }} ₽</template>
              </span>
            </button>

            <div class="stack-y-2">
              <p class="flex items-center justify-center gap-1.5 text-xs text-white/45">
                <BIcon name="Lock" class="w-3.5 h-3.5 text-brand-success" /> {{ copy.secure }}
              </p>
              <p class="text-[11px] text-white/35 text-center leading-relaxed">
                {{ langStore.t.supportLegalNote }}
                <RouterLink :to="{ name: 'terms' }" class="underline hover:text-white/70">{{ langStore.t.legalTerms }}</RouterLink> ·
                <RouterLink :to="{ name: 'privacy' }" class="underline hover:text-white/70">{{ langStore.t.legalPrivacy }}</RouterLink>
              </p>
            </div>
          </div>
        </section>

        <!-- Мобильная версия блока «Куда идёт поддержка» -->
        <section class="lg:hidden grid gap-3 sm:grid-cols-3">
          <div v-for="g in goesTo" :key="g.icon" class="flex items-center gap-3 p-3 rounded-2xl bg-brand-card/60 border border-brand-border/70">
            <span class="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center" :class="g.tone">
              <BIcon :name="g.icon" class="w-5 h-5" />
            </span>
            <div class="min-w-0">
              <p class="text-sm font-bold leading-tight">{{ g.text[0] }}</p>
              <p class="text-xs text-white/50 leading-snug">{{ g.text[1] }}</p>
            </div>
          </div>
        </section>
      </div>

      <p class="mt-10 text-center text-xs text-white/35 flex items-center justify-center gap-1.5">
        <BIcon name="Flower2" class="w-3.5 h-3.5 text-brand-pink" /> {{ copy.thanks }}
      </p>
    </main>
  </div>
</template>

<style scoped>
.support-dots {
  background-image: radial-gradient(rgb(255 255 255 / 0.06) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(to bottom, black, transparent 70%);
}
.support-drift { animation: support-drift 18s ease-in-out infinite alternate; }
.support-drift-rev { animation: support-drift 22s ease-in-out infinite alternate-reverse; }
.support-float { animation: support-float 5s ease-in-out infinite; }
.support-pulse { animation: support-pulse 3.5s ease-in-out infinite; }
.support-shine::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgb(255 255 255 / 0.22) 50%, transparent 70%);
  transform: translateX(-120%);
  animation: support-shine 4s ease-in-out infinite;
}
.support-shine:disabled::after { display: none; }

@keyframes support-drift { to { transform: translate(40px, 30px) scale(1.08); } }
@keyframes support-float { 50% { transform: translateY(-6px); } }
@keyframes support-pulse { 50% { opacity: 0.45; transform: scale(1.12); } }
@keyframes support-shine { 55%, 100% { transform: translateX(120%); } }

@media (prefers-reduced-motion: reduce) {
  .support-drift, .support-drift-rev, .support-float, .support-pulse, .support-shine::after { animation: none; }
}
</style>
