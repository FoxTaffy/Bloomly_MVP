<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import api from '@/api'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import { usePaymentsStore } from '@/stores/payments'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorCode } from '@/lib/apiError'
import { cardBrandInfo } from '@/lib/cardBrand'
import type { PaymentMethod } from '@/types/paymentMethod'

// «Способы оплаты»: карты/ЮMoney, привязанные через ЮKassa (привязка, удаление, основной) и автопродление подписки.
const emit = defineEmits<{ (e: 'toast', type: 'success' | 'error', message: string): void }>()
const langStore = useLangStore()
const payments = usePaymentsStore()
const { confirmDialog } = useConfirm()
const showToast = (type: 'success' | 'error', message: string) => emit('toast', type, message)

// ── Saved payment methods (billing tab) ──────────────────────────────────────
const paymentMethods        = ref<PaymentMethod[]>([])
const paymentMethodsLoading = ref(true)
const binding               = ref(false)
const togglingAutoRenew     = ref(false)

const sub = computed(() => payments.config?.subscription ?? null)
const canBind = computed(() => !!payments.config?.recurring)
const hasPaidPeriod = computed(() => !!sub.value?.expiresAt && sub.value.tier !== 'free')
const nextChargeLabel = computed(() => {
  if (!sub.value?.expiresAt) return ''
  // Списание — за сутки до конца периода (RENEW_AHEAD_MS на сервере)
  const d = new Date(new Date(sub.value.expiresAt).getTime() - 24 * 3600_000)
  return d.toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'long', year: 'numeric' })
})

const methodLabel = (m: PaymentMethod) =>
  m.type === 'yoo_money' ? langStore.t.billingMethodYoomoney : cardBrandInfo(m.brand).label
const methodColor = (m: PaymentMethod) => (m.type === 'yoo_money' ? '#8B3FFD' : cardBrandInfo(m.brand).color)

async function bindMethod() {
  if (binding.value) return
  binding.value = true
  try {
    await payments.startCardBinding() // уводит на страницу оплаты
  } catch (e) {
    showToast('error', apiErrorCode(e) === 'PAYMENTS_DISABLED' ? langStore.t.payGatewayDisabled : langStore.t.subToastError)
    binding.value = false
  }
}

async function toggleAutoRenew() {
  if (!sub.value || togglingAutoRenew.value) return
  togglingAutoRenew.value = true
  try {
    await payments.setAutoRenew(!sub.value.autoRenew)
  } catch {
    showToast('error', langStore.t.subToastError)
  } finally {
    togglingAutoRenew.value = false
  }
}
const deletingMethodId      = ref<string | null>(null)
const settingDefaultId      = ref<string | null>(null)

async function loadPaymentMethods() {
  paymentMethodsLoading.value = true
  try {
    const res = await api.get('/users/me/payment-methods')
    paymentMethods.value = res.data.data ?? []
  } catch {
    paymentMethods.value = []
  } finally {
    paymentMethodsLoading.value = false
  }
}

async function deletePaymentMethod(id: string) {
  if (!(await confirmDialog(langStore.t.billingDeleteConfirm, { danger: true }))) return
  deletingMethodId.value = id
  try {
    await api.delete(`/users/me/payment-methods/${id}`)
    paymentMethods.value = paymentMethods.value.filter(m => m.id !== id)
    // Сервер мог выключить автопродление (не осталось способов) и сменить основной
    await Promise.all([loadPaymentMethods(), payments.fetchConfig().catch(() => {})])
  } catch {
    showToast('error', langStore.t.subToastError)
  } finally {
    deletingMethodId.value = null
  }
}

async function makeDefaultPaymentMethod(id: string) {
  settingDefaultId.value = id
  try {
    await api.patch(`/users/me/payment-methods/${id}/default`)
    paymentMethods.value.forEach(m => { m.is_default = m.id === id })
  } catch {
    showToast('error', langStore.t.subToastError)
  } finally {
    settingDefaultId.value = null
  }
}

onMounted(() => {
  loadPaymentMethods()
  payments.fetchConfig().catch(() => {})
})
</script>

<template>
  <section id="sec-billing" class="bg-brand-card border border-brand-border rounded-3xl shadow-xl overflow-hidden scroll-mt-28">
    <div class="px-6 py-4 border-b border-brand-border flex items-center justify-between gap-3" style="background:linear-gradient(90deg,rgba(76,103,207,0.07) 0%,transparent 100%)">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(76,103,207,0.15)">
          <svg class="w-4 h-4 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"/>
          </svg>
        </div>
        <h2 class="font-bold text-white text-sm">{{ langStore.t.secBillingTitle }}</h2>
      </div>
      <button
        v-if="paymentMethods.length && canBind"
        type="button"
        @click="bindMethod"
        :disabled="binding"
        class="disabled:opacity-50 px-3 py-1.5 rounded-xl text-xs font-bold text-white border border-brand-border hover:border-white/20 bg-white/5 hover:bg-white/10 transition-all active:scale-95 flex-shrink-0"
      >{{ langStore.t.billingBindMethod }}</button>
    </div>

    <div class="p-6 space-y-5">
      <div v-if="paymentMethodsLoading" class="flex justify-center py-6">
        <span class="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></span>
      </div>

      <div v-else-if="!paymentMethods.length" class="text-center py-8">
        <div class="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-3">
          <BIcon name="CreditCard" class="w-6 h-6 text-white/30" />
        </div>
        <p class="text-sm font-semibold text-white/70">{{ langStore.t.billingNoCards }}</p>
        <p class="text-xs text-white/40 mt-1 max-w-xs mx-auto">{{ langStore.t.billingNoCardsHint }}</p>
        <button
          v-if="canBind"
          type="button"
          @click="bindMethod"
          :disabled="binding"
          class="disabled:opacity-50 mt-4 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all active:scale-95 hover:brightness-110"
          style="background: linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%);"
        >{{ langStore.t.billingBindMethod }}</button>
        <p v-if="canBind" class="text-[11px] text-white/30 mt-2">{{ langStore.t.billingBindHint }}</p>
        <p v-else class="text-[11px] text-white/30 mt-3">{{ langStore.t.payGatewayDisabled }}</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="m in paymentMethods" :key="m.id"
          class="flex items-center gap-3 p-4 rounded-2xl border transition-all"
          :class="m.is_default ? 'border-brand-accent/40 bg-brand-accent/5' : 'border-brand-border bg-brand-bg/40'"
        >
          <span class="px-2 py-1 rounded-lg text-[10px] font-black tracking-wide flex-shrink-0"
            :style="`background:${methodColor(m)}22; color:${methodColor(m)}`">
            {{ methodLabel(m) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="font-mono text-sm text-white/85">{{ m.last4 ? `•••• ${m.last4}` : m.title }}</p>
            <p v-if="m.exp_month && m.exp_year" class="text-xs text-white/35 truncate">
              {{ String(m.exp_month).padStart(2, '0') }}/{{ String(m.exp_year).slice(-2) }}
            </p>
          </div>
          <span v-if="m.is_default" class="px-2.5 py-1 rounded-lg text-[10px] font-bold flex-shrink-0" style="background:rgba(16,185,129,0.15);color:#34d399">
            {{ langStore.t.billingDefaultBadge }}
          </span>
          <button
            v-else
            type="button"
            @click="makeDefaultPaymentMethod(m.id)"
            :disabled="settingDefaultId === m.id"
            class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white/55 hover:text-white border border-brand-border hover:border-white/20 transition-all disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
          >{{ langStore.t.billingSetDefault }}</button>
          <button
            type="button"
            @click="deletePaymentMethod(m.id)"
            :disabled="deletingMethodId === m.id"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50 flex-shrink-0"
          >
            <span v-if="deletingMethodId === m.id" class="w-3.5 h-3.5 border border-t-transparent border-red-400 rounded-full animate-spin"></span>
            <BIcon v-else name="Trash2" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Автопродление подписки -->
      <div v-if="!paymentMethodsLoading && sub && canBind" class="flex items-center gap-3 p-4 rounded-2xl border border-brand-border bg-brand-bg/40">
        <BIcon name="RefreshCw" class="w-4 h-4 text-white/50 flex-shrink-0" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-bold text-white/85">{{ langStore.t.billingAutoRenewTitle }}</p>
          <p class="text-xs text-white/40 mt-0.5">
            <template v-if="!hasPaidPeriod">{{ langStore.t.billingAutoRenewNoSub }}</template>
            <template v-else-if="!paymentMethods.length">{{ langStore.t.billingAutoRenewNoMethod }}</template>
            <template v-else-if="sub.autoRenew">{{ langStore.t.billingAutoRenewNext }}: {{ nextChargeLabel }}</template>
          </p>
        </div>
        <button
          type="button"
          role="switch"
          :aria-checked="sub.autoRenew"
          :aria-label="langStore.t.billingAutoRenewTitle"
          :disabled="togglingAutoRenew || (!sub.autoRenew && (!hasPaidPeriod || !paymentMethods.length))"
          @click="toggleAutoRenew"
          class="w-10 h-6 rounded-full p-0.5 flex items-center transition-colors flex-shrink-0 disabled:opacity-40"
          :class="sub.autoRenew ? 'bg-brand-success' : 'bg-brand-muted'"
        >
          <span class="w-5 h-5 rounded-full bg-white shadow-md transition-transform" :class="sub.autoRenew ? 'translate-x-4' : 'translate-x-0'" />
        </button>
      </div>
    </div>
  </section>
</template>
