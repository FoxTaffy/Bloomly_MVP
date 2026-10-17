<script setup lang="ts">
// Донат на развитие проекта: оплата через ЮKassa, итог — на /payment/result
import { ref, computed, onMounted } from 'vue'
import { useLangStore } from '@/stores/lang'
import { usePaymentsStore } from '@/stores/payments'
import { apiErrorMessage } from '@/lib/apiError'
import AppHeader from '@/components/AppHeader.vue'
import BIcon from '@/components/BIcon.vue'

const langStore = useLangStore()
const payments = usePaymentsStore()

const PRESETS = [100, 300, 500, 1000, 3000]
const amount = ref<number | null>(300)
const custom = ref<number | null>(null)
const method = ref<'AC' | 'PC'>('AC')
const sending = ref(false)
const errorMsg = ref('')

const METHODS = computed(() => [
  { id: 'AC' as const, icon: 'CreditCard', label: langStore.t.payMethodCard },
  { id: 'PC' as const, icon: 'Wallet', label: langStore.t.payMethodYoomoney },
])
const limits = computed(() => payments.config?.donate ?? { min: 30, max: 50000 })
const enabled = computed(() => payments.config?.enabled ?? false)
const valid = computed(() => Number.isInteger(amount.value) && amount.value! >= limits.value.min && amount.value! <= limits.value.max)

function pick(v: number) { amount.value = v; custom.value = null }
function onCustom() { amount.value = custom.value }

async function donate() {
  if (!valid.value || sending.value) return
  sending.value = true
  errorMsg.value = ''
  try {
    await payments.startDonation(amount.value!, method.value) // уходит на страницу ЮKassa
  } catch (e) {
    errorMsg.value = apiErrorMessage(e) || langStore.t.subToastError
    sending.value = false
  }
}

onMounted(() => { payments.fetchConfig().catch(() => {}) })
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />
    <main class="max-w-md mx-auto px-4 pt-28 pb-20">
      <div class="bg-brand-card border border-brand-border rounded-3xl p-6 sm:p-8 space-y-5">
        <div class="text-center space-y-2">
          <div class="w-14 h-14 mx-auto rounded-2xl bg-brand-accent/15 flex items-center justify-center">
            <BIcon name="Heart" class="w-7 h-7 text-brand-accent" />
          </div>
          <h1 class="text-xl font-extrabold">{{ langStore.t.supportProject }}</h1>
          <p class="text-sm text-white/60">{{ langStore.t.supportDesc }}</p>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button v-for="m in METHODS" :key="m.id" @click="method = m.id"
            class="flex items-center justify-center gap-2 py-2.5 rounded-2xl border text-sm font-bold transition-all"
            :class="method === m.id ? 'border-brand-accent bg-brand-accent/15 text-white' : 'border-brand-border text-white/50 hover:text-white'">
            <BIcon :name="m.icon" class="w-4 h-4" /> {{ m.label }}
          </button>
        </div>

        <div>
          <p class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2">{{ langStore.t.supportAmount }}</p>
          <div class="grid grid-cols-5 gap-2">
            <button v-for="p in PRESETS" :key="p" @click="pick(p)"
              class="py-2 rounded-xl border text-sm font-bold transition-all"
              :class="amount === p && custom === null ? 'border-brand-accent bg-brand-accent/15 text-white' : 'border-brand-border text-white/60 hover:text-white'">
              {{ p }}
            </button>
          </div>
          <input v-model.number="custom" @input="onCustom" type="number" inputmode="numeric" step="1"
            :min="limits.min" :max="limits.max"
            :placeholder="`${langStore.t.supportCustom} (${limits.min}–${limits.max})`"
            class="mt-2 w-full px-4 py-2.5 rounded-2xl bg-brand-bg border border-brand-border text-sm outline-none focus:border-brand-accent" />
        </div>

        <p v-if="payments.config && !enabled" class="text-xs text-amber-400 text-center">{{ langStore.t.supportDisabled }}</p>
        <p v-if="errorMsg" class="text-xs text-red-400 text-center">{{ errorMsg }}</p>

        <button :disabled="!valid || !enabled || sending" @click="donate"
          class="w-full py-3 rounded-2xl bg-brand-accent text-sm font-bold text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          {{ langStore.t.supportDonate }}<template v-if="valid"> · {{ amount }} ₽</template>
        </button>

        <p class="text-[11px] text-white/35 text-center leading-relaxed">
          {{ langStore.t.supportLegalNote }}
          <RouterLink :to="{ name: 'terms' }" class="underline hover:text-white/70">{{ langStore.t.legalTerms }}</RouterLink> ·
          <RouterLink :to="{ name: 'privacy' }" class="underline hover:text-white/70">{{ langStore.t.legalPrivacy }}</RouterLink>
        </p>
      </div>
    </main>
  </div>
</template>
