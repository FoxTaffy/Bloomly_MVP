<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useLangStore } from '@/stores/lang'
import { useWalletStore } from '@/stores/wallet'
import { usePaymentsStore, type PayMethod, type BillingPeriod, type PlanQuote } from '@/stores/payments'
import { apiErrorCode } from '@/lib/apiError'
import BIcon from '@/components/BIcon.vue'
import { blmLocal } from '@/lib/format'

const props = defineProps<{
  plan: { id: string; label: string; color: string; gradient: string; features: string[] }
  period: BillingPeriod
  price: number
  originalPrice?: number
  discounted?: boolean
}>()

const emit = defineEmits<{ close: []; success: [planId: string, expiresAt: string | null] }>()

const langStore = useLangStore()
const walletStore = useWalletStore()
const payments = usePaymentsStore()

const step     = ref<'method' | 'success'>('method')
const loading  = ref(true)
const sending  = ref(false)
const errorMsg = ref('')
const method   = ref<PayMethod>('AC')
const quoteRes = ref<PlanQuote | null>(null)
const gatewayEnabled = ref(false)
const hasSavedMethod = ref(false)
const recurringEnabled = ref(false)
// Автопродление: при оплате через ЮKassa способ сохраняется; с баланса — работает, если карта уже привязана
const autoRenew = ref(true)
const canAutoRenew = computed(() => recurringEnabled.value && (method.value !== 'wallet' || hasSavedMethod.value))

// Пока сервер не ответил — показываем цену со страницы тарифов (в BLM)
const months   = computed(() => (props.period === 'year' ? 12 : 1))
const perMonth = computed(() => quoteRes.value?.blmPerMonth ?? props.price)
const totalBc  = computed(() => quoteRes.value?.blmAmount ?? Math.round(props.price * months.value * 100) / 100)
// На шлюз (карта, ЮMoney) уходит рублёвый эквивалент по текущему курсу — известен только от сервера
const totalRub = computed(() => quoteRes.value?.amount ?? null)
const localTotal = computed(() => blmLocal(totalBc.value))
const canPayFromWallet = computed(() => walletStore.balance >= totalBc.value)

const METHODS = computed(() => [
  { id: 'AC' as const, icon: 'CreditCard', label: langStore.t.payMethodCard, disabled: !gatewayEnabled.value },
  { id: 'PC' as const, icon: 'Wallet', label: langStore.t.payMethodYoomoney, disabled: !gatewayEnabled.value },
  { id: 'wallet' as const, icon: 'Flower2', label: langStore.t.payMethodWallet, disabled: !canPayFromWallet.value },
])

onMounted(async () => {
  try {
    const [cfg, q] = await Promise.all([
      payments.fetchConfig(),
      payments.quote(props.plan.id, props.period),
      walletStore.fetchBalance().catch(() => 0),
    ])
    gatewayEnabled.value = cfg.enabled
    hasSavedMethod.value = cfg.hasSavedMethod
    recurringEnabled.value = cfg.recurring
    quoteRes.value = q
  } catch {
    errorMsg.value = langStore.t.subToastError
  } finally {
    if (!gatewayEnabled.value) method.value = 'wallet'
    loading.value = false
  }
})

const CONFETTI_COLORS = ['#4C67CF', '#66C770', '#F7A9E2', '#CD83F5', '#FFC01F', '#E76F51']

const confettiPieces = computed(() => {
  if (step.value !== 'success') return []
  // Stratified spread across the width so pieces never clump by chance,
  // with a staggered delay so the burst keeps raining instead of firing all at once.
  const COLS = 14
  return Array.from({ length: 64 }, (_, i) => {
    const col = i % COLS
    return {
      id: i,
      left: (col / COLS) * 100 + (Math.random() * (100 / COLS) * 0.8),
      size: 5 + Math.random() * 7,
      round: Math.random() > 0.6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: Math.random() * 1.1,
      duration: 2.2 + Math.random() * 1.8,
      rotate: Math.round((Math.random() - 0.5) * 720),
      drift: Math.round((Math.random() - 0.5) * 140),
    }
  })
})

const ERROR_TEXT: Record<string, () => string> = {
  INSUFFICIENT_FUNDS: () => langStore.t.payInsufficient,
  SUBSCRIPTION_COMPED: () => langStore.t.payErrComped,
  PAYMENTS_DISABLED: () => langStore.t.payGatewayDisabled,
}

async function pay() {
  const current = METHODS.value.find(m => m.id === method.value)
  if (sending.value || loading.value || !current || current.disabled) return
  sending.value = true
  errorMsg.value = ''
  try {
    const res = await payments.startSubscription(props.plan.id, props.period, method.value, canAutoRenew.value && autoRenew.value)
    // Онлайн-оплата — браузер уже уходит на страницу ЮKassa, кнопку оставляем в состоянии загрузки
    if (res.confirmationUrl) return
    walletStore.fetchBalance().catch(() => {})
    step.value = 'success'
    emit('success', props.plan.id, res.subscription?.expiresAt ?? null)
    sending.value = false
  } catch (e) {
    errorMsg.value = ERROR_TEXT[apiErrorCode(e) ?? '']?.() ?? langStore.t.subToastError
    sending.value = false
  }
}

function close() {
  if (sending.value) return
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pay-fade">
      <div class="fixed inset-0 z-700 flex items-end sm:items-center justify-center" @click.self="close">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-xs" @click="close" />

        <div class="relative w-full sm:max-w-sm bg-[#13131f] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden z-10 modal-glow">
          <div class="h-1 w-full bg-linear-to-r/srgb from-brand-accent via-brand-purple to-brand-pink" />
          <div class="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

          <!-- STEP: payment method -->
          <template v-if="step === 'method'">
            <div class="px-6 pt-5 pb-6 stack-y-5">
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-extrabold text-white">{{ langStore.t.payModalTitle }}</h2>
                <button @click="close"
                  class="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all active:scale-90 shrink-0">
                  <BIcon name="X" class="w-4 h-4" />
                </button>
              </div>

              <!-- Plan / price row -->
              <div class="px-4 py-3 rounded-2xl border border-white/10 bg-linear-to-r/srgb from-white/6 to-white/2 stack-y-1.5">
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-1.5 text-sm font-extrabold" :class="plan.color">
                    <BIcon name="Sparkles" class="w-3.5 h-3.5" />
                    {{ plan.label }}
                  </span>
                  <div class="flex items-center gap-2">
                    <span v-if="discounted && originalPrice" class="text-xs text-white/30 line-through">{{ originalPrice }} BLM</span>
                    <span class="text-sm font-extrabold text-white">{{ perMonth }} BLM{{ langStore.t.subPerMonth }}</span>
                  </div>
                </div>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-white/40">{{ period === 'year' ? langStore.t.payPeriodYear : langStore.t.payPeriodMonth }}</span>
                  <span class="text-white/70 font-bold">{{ langStore.t.payTotal }}: {{ totalBc }} BLM<template v-if="localTotal"> ≈ {{ localTotal }}</template></span>
                </div>
              </div>

              <div v-if="loading" class="flex justify-center py-10">
                <span class="w-6 h-6 border-2 border-white/15 border-t-white/60 rounded-full animate-spin" />
              </div>

              <template v-else>
                <div class="stack-y-2">
                  <p class="text-[11px] font-bold uppercase tracking-wider text-white/35">{{ langStore.t.payMethodTitle }}</p>
                  <button
                    v-for="m in METHODS" :key="m.id"
                    @click="!m.disabled && (method = m.id)"
                    :disabled="m.disabled"
                    class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed"
                    :class="method === m.id && !m.disabled ? 'border-brand-accent/60 bg-brand-accent/10' : 'border-white/10 bg-white/5 hover:border-white/20'">
                    <BIcon :name="m.icon" class="w-4 h-4 text-white/70 shrink-0" />
                    <span class="text-sm font-bold text-white/85 flex-1">{{ m.label }}</span>
                    <span v-if="m.id === 'wallet'" class="text-xs font-mono"
                      :class="canPayFromWallet ? 'text-white/45' : 'text-brand-error/80'">
                      {{ walletStore.balance.toFixed(2) }} / {{ totalBc.toFixed(2) }}
                    </span>
                    <BIcon v-if="method === m.id && !m.disabled" name="CheckCircle2" class="w-4 h-4 text-brand-accent shrink-0" />
                  </button>
                </div>

                <label v-if="canAutoRenew" class="flex items-start gap-3 px-4 py-3 rounded-2xl border border-white/10 bg-white/5 cursor-pointer select-none">
                  <input v-model="autoRenew" type="checkbox" class="mt-0.5 w-4 h-4 accent-brand-accent shrink-0" />
                  <span class="min-w-0">
                    <span class="block text-sm font-bold text-white/85">{{ langStore.t.payAutoRenew }}</span>
                    <span class="block text-[11px] text-white/40 mt-0.5 leading-snug">{{ langStore.t.payAutoRenewHint }}</span>
                  </span>
                </label>

                <p v-if="!gatewayEnabled" class="text-[11px] text-white/40 text-center">{{ langStore.t.payGatewayDisabled }}</p>
                <p v-else-if="method !== 'wallet'" class="text-[11px] text-white/40 text-center">{{ langStore.t.payRedirectHint }}</p>

                <p v-if="errorMsg" class="text-xs text-brand-error text-center">{{ errorMsg }}</p>

                <button
                  @click="pay"
                  :disabled="sending || METHODS.find(m => m.id === method)?.disabled"
                  class="w-full py-4 rounded-2xl text-base font-extrabold text-white transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.97] hover:brightness-110 shadow-lg shadow-brand-accent/30"
                  style="background: linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%);">
                  <BIcon v-if="sending" name="Loader2" class="w-5 h-5 animate-spin" />
                  <BIcon v-else name="Lock" class="w-4 h-4" />
                  {{ sending ? langStore.t.payModalProcessing : `${langStore.t.payModalPayBtn} ${method === 'wallet' || totalRub === null ? `${totalBc} BLM` : `${totalRub} ₽`}` }}
                </button>
              </template>

              <div class="flex items-center justify-center gap-2 text-[11px] text-white/25">
                <BIcon name="Shield" class="w-3.5 h-3.5" />
                {{ langStore.t.payModalSecure }}
              </div>
            </div>
          </template>

          <!-- STEP: success / welcome -->
          <template v-else-if="step === 'success'">
            <div class="relative px-6 pt-8 pb-6 text-center overflow-hidden">
              <div class="absolute inset-0 overflow-hidden pointer-events-none">
                <span v-for="p in confettiPieces" :key="p.id" class="confetti-piece"
                  :class="p.round ? 'rounded-full' : 'rounded-xs'"
                  :style="{
                    left: p.left + '%',
                    width: p.size + 'px',
                    height: (p.round ? p.size : p.size * 0.42) + 'px',
                    background: p.color,
                    animationDelay: p.delay + 's',
                    animationDuration: p.duration + 's',
                    '--drift': p.drift + 'px',
                    '--rot': p.rotate + 'deg',
                  }" />
              </div>

              <div class="relative z-10">
                <div class="relative w-24 h-24 mx-auto mb-5 success-pop">
                  <span class="absolute inset-0 rounded-full badge-glow" style="background: linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%);" />
                  <span class="absolute inset-0 rounded-full badge-ring" />
                  <span class="absolute inset-0 rounded-full badge-ring badge-ring-delay" />
                  <div class="relative w-24 h-24 rounded-full flex items-center justify-center"
                    style="background: linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%); box-shadow: 0 10px 34px rgba(124,111,219,0.55), inset 0 1px 0 rgba(255,255,255,0.25);">
                    <BIcon name="PartyPopper" class="w-10 h-10 text-white drop-shadow-sm" />
                  </div>
                </div>

                <h2 class="text-2xl font-extrabold text-white mb-1">{{ langStore.t.welcomeHeading }}</h2>
                <p class="text-white/55 text-sm mb-6">
                  <span class="font-bold" :class="plan.color">{{ plan.label }}</span>
                  {{ ' ' }}{{ langStore.t.welcomeActivated }}
                </p>

                <div class="bg-white/5 border border-white/10 rounded-2xl p-4 text-left mb-6">
                  <p class="text-[11px] font-bold uppercase tracking-wider text-white/35 mb-3">{{ langStore.t.welcomePrivilegesTitle }}</p>
                  <ul class="stack-y-2.5">
                    <li v-for="(f, i) in plan.features" :key="f"
                      class="feature-pop flex items-center gap-2 text-sm text-white/80"
                      :style="{ animationDelay: `${300 + i * 100}ms` }">
                      <BIcon name="Check" class="w-4 h-4 shrink-0" :class="plan.color" />
                      {{ f }}
                    </li>
                  </ul>
                </div>

                <button @click="close"
                  class="w-full py-3.5 rounded-2xl text-sm font-extrabold text-white transition-all duration-150 active:scale-[0.97] hover:brightness-110 shadow-lg shadow-brand-accent/30"
                  style="background: linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%);">
                  {{ langStore.t.welcomeContinueBtn }}
                </button>
              </div>
            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pay-fade-enter-active { transition: opacity 0.2s ease; }
.pay-fade-leave-active { transition: opacity 0.15s ease; }
.pay-fade-enter-from, .pay-fade-leave-to { opacity: 0; }
.pay-fade-enter-active > div:last-child { transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); }
.pay-fade-enter-from > div:last-child { transform: translateY(30px) scale(0.96); }

.modal-glow {
  box-shadow: 0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03), 0 0 80px -10px rgba(124,111,219,0.35);
}

/* Confetti */
.confetti-piece {
  position: absolute;
  top: -12px;
  border-radius: 2px;
  opacity: 0.95;
  animation-name: confetti-fall;
  animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  animation-fill-mode: forwards;
}
@keyframes confetti-fall {
  0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate(var(--drift), 420px) rotate(var(--rot)); opacity: 0; }
}

.success-pop {
  opacity: 0;
  animation: success-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes success-pop-in {
  0%   { opacity: 0; transform: scale(0.4); }
  100% { opacity: 1; transform: scale(1); }
}

.badge-glow {
  filter: blur(20px);
  opacity: 0.65;
  animation: badge-breathe 2.4s ease-in-out 0.5s infinite;
}
@keyframes badge-breathe {
  0%, 100% { transform: scale(0.9); opacity: 0.5; }
  50%      { transform: scale(1.15); opacity: 0.8; }
}

.badge-ring {
  border: 2px solid rgba(205,131,245,0.5);
  opacity: 0;
  animation: badge-ping 2.2s ease-out 0.6s infinite;
}
.badge-ring-delay { animation-delay: 1.7s; }
@keyframes badge-ping {
  0%   { transform: scale(0.85); opacity: 0.7; }
  100% { transform: scale(1.6); opacity: 0; }
}

.feature-pop {
  opacity: 0;
  animation: feature-in 0.45s ease forwards;
}
@keyframes feature-in {
  0%   { opacity: 0; transform: translateY(-14px); }
  100% { opacity: 1; transform: translateY(0); }
}
</style>
