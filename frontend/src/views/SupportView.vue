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

const PRESETS = [500, 1000, 2000, 3000, 5000]
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
    <!-- Декоративное свечение за героем -->
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-to-b from-brand-accent/25 via-brand-accent/5 to-transparent"></div>
    <div class="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[640px] h-[640px] rounded-full bg-brand-accent/10 blur-3xl"></div>

    <AppHeader />

    <main class="relative max-w-5xl mx-auto px-4 sm:px-6 pt-28 pb-20">
      <div class="grid gap-6 lg:grid-cols-5 lg:items-start">
        <!-- Левая колонка: герой -->
        <section class="lg:col-span-2 text-center lg:text-left space-y-5 lg:pt-10">
          <div class="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-brand-card border border-brand-border shadow-xl shadow-brand-accent/20">
            <img src="/bloomly.png?v=2" alt="Bloomly" class="w-12 h-12 object-contain" />
          </div>
          <div class="space-y-3">
            <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">{{ langStore.t.supportProject }}</h1>
            <p class="text-sm sm:text-base text-white/65 leading-relaxed max-w-md mx-auto lg:mx-0">{{ langStore.t.supportDesc }}</p>
          </div>
          <div class="hidden lg:flex items-center gap-3 pt-2">
            <span class="w-10 h-10 rounded-2xl bg-brand-accent/15 flex items-center justify-center">
              <BIcon name="Heart" class="w-5 h-5 text-brand-accent" />
            </span>
            <span class="w-10 h-10 rounded-2xl bg-brand-yellow/10 flex items-center justify-center">
              <BIcon name="Sparkles" class="w-5 h-5 text-brand-yellow" />
            </span>
            <span class="w-10 h-10 rounded-2xl bg-brand-pink/10 flex items-center justify-center">
              <BIcon name="Gift" class="w-5 h-5 text-brand-pink" />
            </span>
          </div>
        </section>

        <!-- Правая колонка: форма доната -->
        <section class="lg:col-span-3 rounded-3xl bg-brand-card/90 backdrop-blur border border-brand-border shadow-2xl shadow-black/30 p-5 sm:p-8 space-y-6">
          <!-- Способы оплаты -->
          <div class="flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-brand-bg border border-brand-border text-sm font-bold text-white/70">
            <BIcon name="CreditCard" class="w-4 h-4 text-brand-accent" /> {{ langStore.t.payMethodOnline }}
          </div>

          <!-- Сумма -->
          <div class="space-y-3">
            <p class="text-xs font-bold text-white/45 uppercase tracking-wider">{{ langStore.t.supportAmount }}</p>
            <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <button v-for="p in PRESETS" :key="p" @click="pick(p)"
                class="py-3 rounded-2xl border text-sm font-extrabold transition-all"
                :class="amount === p && custom === null
                  ? 'border-brand-accent bg-brand-accent/15 text-white shadow-md shadow-brand-accent/20 -translate-y-0.5'
                  : 'border-brand-border bg-brand-bg/60 text-white/60 hover:text-white hover:border-brand-muted'">
                {{ p }} <span class="text-[10px] font-semibold opacity-70">₽</span>
              </button>
            </div>
            <div class="relative">
              <input v-model.number="custom" @input="onCustom" type="number" inputmode="numeric" step="1"
                :min="limits.min" :max="limits.max"
                :placeholder="`${langStore.t.supportCustom} (${limits.min}–${limits.max})`"
                class="w-full pl-4 pr-10 py-3 rounded-2xl bg-brand-bg border border-brand-border text-sm outline-none transition focus:border-brand-accent focus:ring-4 focus:ring-brand-accent/15" />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-white/40">₽</span>
            </div>
          </div>

          <!-- Итог и кнопка -->
          <div class="rounded-2xl bg-brand-bg/70 border border-brand-border p-4 flex items-center justify-between gap-4">
            <span class="text-sm text-white/55">{{ langStore.t.supportProject }}</span>
            <span class="text-2xl font-extrabold tabular-nums">
              <template v-if="valid">{{ amount }} ₽</template>
              <template v-else>—</template>
            </span>
          </div>

          <p v-if="payments.config && !enabled" class="text-xs text-amber-400 text-center">{{ langStore.t.supportDisabled }}</p>
          <p v-if="errorMsg" class="text-xs text-brand-error text-center">{{ errorMsg }}</p>

          <button :disabled="!valid || !enabled || sending" @click="donate"
            class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-brand-accent to-brand-accent-plus text-sm sm:text-base font-extrabold text-white shadow-lg shadow-brand-accent/30 hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:hover:translate-y-0 transition-all">
            {{ langStore.t.supportDonate }}<template v-if="valid"> · {{ amount }} ₽</template>
          </button>

          <p class="text-[11px] text-white/35 text-center leading-relaxed">
            {{ langStore.t.supportLegalNote }}
            <RouterLink :to="{ name: 'terms' }" class="underline hover:text-white/70">{{ langStore.t.legalTerms }}</RouterLink> ·
            <RouterLink :to="{ name: 'privacy' }" class="underline hover:text-white/70">{{ langStore.t.legalPrivacy }}</RouterLink>
          </p>
        </section>
      </div>
    </main>
  </div>
</template>
