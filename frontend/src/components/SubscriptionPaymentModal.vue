<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useLangStore } from '@/stores/lang'
import { useAuthStore } from '@/stores/auth'
import BIcon from '@/components/BIcon.vue'
import CardFlipInput from '@/components/CardFlipInput.vue'
import api from '@/api'
import type { PaymentMethod } from '@/types/paymentMethod'
import { cardBrandInfo } from '@/lib/cardBrand'
import { altMethodsForRegion } from '@/lib/paymentRegions'

const props = defineProps<{
  plan: { id: string; label: string; color: string; gradient: string; features: string[] }
  price: number
  originalPrice?: number
  discounted?: boolean
}>()

const emit = defineEmits<{ close: []; success: [planId: string] }>()

const langStore = useLangStore()
const authStore = useAuthStore()

const step    = ref<'card' | 'success'>('card')
const flipped = ref(false)
const sending = ref(false)
const errorMsg = ref('')

const cardNum  = ref('')
const cardExp  = ref('')
const cardCvv  = ref('')
const cardName = ref('')
const saveCard = ref(true)

const savedMethods   = ref<PaymentMethod[]>([])
const loadingMethods = ref(true)
const useNewCard     = ref(false)
const selectedId     = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await api.get('/users/me/payment-methods')
    savedMethods.value = res.data.data ?? []
    selectedId.value = savedMethods.value.find(m => m.is_default)?.id ?? savedMethods.value[0]?.id ?? null
  } catch {
    savedMethods.value = []
  } finally {
    if (savedMethods.value.length === 0) useNewCard.value = true
    loadingMethods.value = false
  }
})

const CONFETTI_COLORS = ['#4C67CF', '#66C770', '#F7A9E2', '#CD83F5', '#FFC01F', '#E76F51']

const cardValid = computed(() =>
  cardNum.value.replace(/\s/g, '').length === 16 &&
  cardExp.value.length === 5 &&
  cardCvv.value.length >= 3 &&
  cardName.value.trim().length >= 2
)

// Regional alternatives (PayPal, Alipay, Bitcoin, …) shown only when the user has no card on file yet.
const altMethods = computed(() => altMethodsForRegion(authStore.user?.payment_region))
const altMsg = ref('')

function tryAltMethod() {
  altMsg.value = langStore.t.payModalAltComingSoon
  setTimeout(() => { altMsg.value = '' }, 2500)
}

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

async function chargeSubscription() {
  await Promise.all([
    api.patch('/users/me/subscription', { tier: props.plan.id }),
    new Promise(r => setTimeout(r, 1200)),
  ])
  step.value = 'success'
  emit('success', props.plan.id)
}

async function payWithSaved() {
  if (!selectedId.value || sending.value) return
  sending.value = true
  errorMsg.value = ''
  try {
    await chargeSubscription()
  } catch {
    errorMsg.value = langStore.t.subToastError
  } finally {
    sending.value = false
  }
}

async function payWithNewCard() {
  if (!cardValid.value || sending.value) return
  sending.value = true
  errorMsg.value = ''
  flipped.value = false
  try {
    await chargeSubscription()
    if (saveCard.value) {
      const [expMonth, expYear] = cardExp.value.split('/')
      try {
        await api.post('/users/me/payment-methods', {
          cardNumber: cardNum.value,
          expMonth: Number(expMonth),
          expYear: 2000 + Number(expYear),
          holderName: cardName.value,
        })
      } catch {
        // Saving the card is best-effort — the payment itself already succeeded.
      }
    }
  } catch {
    errorMsg.value = langStore.t.subToastError
  } finally {
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
      <div class="fixed inset-0 z-[700] flex items-end sm:items-center justify-center" @click.self="close">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="close" />

        <div class="relative w-full sm:max-w-sm bg-[#13131f] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden z-10 modal-glow">
          <div class="h-1 w-full bg-gradient-to-r from-brand-accent via-brand-purple to-brand-pink" />
          <div class="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

          <!-- STEP: card details -->
          <template v-if="step === 'card'">
            <div class="px-6 pt-5 pb-6 space-y-5">
              <div class="flex items-center justify-between">
                <h2 class="text-lg font-extrabold text-white">{{ langStore.t.payModalTitle }}</h2>
                <button @click="close"
                  class="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all active:scale-90 flex-shrink-0">
                  <BIcon name="X" class="w-4 h-4" />
                </button>
              </div>

              <!-- Plan / price row -->
              <div class="flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10 bg-gradient-to-r from-white/[0.06] to-white/[0.02]">
                <span class="flex items-center gap-1.5 text-sm font-extrabold" :class="plan.color">
                  <BIcon name="Sparkles" class="w-3.5 h-3.5" />
                  {{ plan.label }}
                </span>
                <div class="flex items-center gap-2">
                  <span v-if="discounted && originalPrice" class="text-xs text-white/30 line-through">{{ originalPrice }} ₽</span>
                  <span class="text-sm font-extrabold text-white">{{ price }} ₽{{ langStore.t.subPerMonth }}</span>
                </div>
              </div>

              <div v-if="loadingMethods" class="flex justify-center py-10">
                <span class="w-6 h-6 border-2 border-white/15 border-t-white/60 rounded-full animate-spin" />
              </div>

              <!-- Pay with a saved card -->
              <template v-else-if="!useNewCard && savedMethods.length">
                <div class="space-y-2">
                  <button
                    v-for="m in savedMethods" :key="m.id"
                    @click="selectedId = m.id"
                    class="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left"
                    :class="selectedId === m.id ? 'border-brand-accent/60 bg-brand-accent/10' : 'border-white/10 bg-white/5 hover:border-white/20'">
                    <span class="px-2 py-1 rounded-lg text-[10px] font-black tracking-wide flex-shrink-0"
                      :style="`background:${cardBrandInfo(m.brand).color}22; color:${cardBrandInfo(m.brand).color}`">
                      {{ cardBrandInfo(m.brand).label }}
                    </span>
                    <span class="font-mono text-sm text-white/85 flex-1">•••• {{ m.last4 }}</span>
                    <span class="text-xs text-white/35 font-mono">{{ String(m.exp_month).padStart(2, '0') }}/{{ String(m.exp_year).slice(-2) }}</span>
                    <BIcon v-if="selectedId === m.id" name="CheckCircle2" class="w-4 h-4 text-brand-accent flex-shrink-0" />
                  </button>
                </div>

                <p v-if="errorMsg" class="text-xs text-brand-error text-center">{{ errorMsg }}</p>

                <button
                  @click="payWithSaved"
                  :disabled="!selectedId || sending"
                  class="w-full py-4 rounded-2xl text-base font-extrabold text-white transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.97] hover:brightness-110 shadow-lg shadow-brand-accent/30"
                  style="background: linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%);">
                  <BIcon v-if="sending" name="Loader2" class="w-5 h-5 animate-spin" />
                  <BIcon v-else name="Lock" class="w-4 h-4" />
                  {{ sending ? langStore.t.payModalProcessing : `${langStore.t.payModalPayBtn} ${price} ₽${langStore.t.subPerMonth}` }}
                </button>

                <button @click="useNewCard = true" class="w-full text-center text-xs font-semibold text-white/45 hover:text-white transition-colors">
                  {{ langStore.t.payModalUseNewCard }}
                </button>
              </template>

              <!-- New card form -->
              <template v-else>
                <CardFlipInput
                  v-model:card-num="cardNum" v-model:card-exp="cardExp"
                  v-model:card-cvv="cardCvv" v-model:card-name="cardName"
                  v-model:flipped="flipped" />

                <label class="flex items-center gap-2.5 text-xs text-white/55 select-none cursor-pointer">
                  <input type="checkbox" v-model="saveCard" class="save-card-checkbox" />
                  {{ langStore.t.payModalSaveCard }}
                </label>

                <p v-if="errorMsg" class="text-xs text-brand-error text-center">{{ errorMsg }}</p>

                <button
                  @click="payWithNewCard"
                  :disabled="!cardValid || sending"
                  class="w-full py-4 rounded-2xl text-base font-extrabold text-white transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.97] hover:brightness-110 shadow-lg shadow-brand-accent/30"
                  style="background: linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%);">
                  <BIcon v-if="sending" name="Loader2" class="w-5 h-5 animate-spin" />
                  <BIcon v-else name="Lock" class="w-4 h-4" />
                  {{ sending ? langStore.t.payModalProcessing : `${langStore.t.payModalPayBtn} ${price} ₽${langStore.t.subPerMonth}` }}
                </button>

                <button v-if="savedMethods.length" @click="useNewCard = false" class="w-full text-center text-xs font-semibold text-white/45 hover:text-white transition-colors">
                  {{ langStore.t.payModalUseSavedCard }}
                </button>

                <!-- Regional alternatives — only relevant when there's no card on file -->
                <div v-if="!loadingMethods && !savedMethods.length" class="pt-1">
                  <div class="flex items-center gap-3 mb-3">
                    <div class="flex-1 h-px bg-white/10" />
                    <span class="text-[10px] font-bold uppercase tracking-wider text-white/30">{{ langStore.t.payModalAltMethodsTitle }}</span>
                    <div class="flex-1 h-px bg-white/10" />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      v-for="am in altMethods" :key="am.id"
                      @click="tryAltMethod"
                      class="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold text-white/60 border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white transition-all active:scale-95"
                    >
                      <BIcon :name="am.icon" class="w-3.5 h-3.5" />
                      {{ am.label }}
                    </button>
                  </div>
                  <p v-if="altMsg" class="text-[11px] text-white/40 text-center mt-2">{{ altMsg }}</p>
                </div>
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
                  :class="p.round ? 'rounded-full' : 'rounded-sm'"
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
                    <BIcon name="PartyPopper" class="w-10 h-10 text-white drop-shadow" />
                  </div>
                </div>

                <h2 class="text-2xl font-extrabold text-white mb-1">{{ langStore.t.welcomeHeading }}</h2>
                <p class="text-white/55 text-sm mb-6">
                  <span class="font-bold" :class="plan.color">{{ plan.label }}</span>
                  {{ ' ' }}{{ langStore.t.welcomeActivated }}
                </p>

                <div class="bg-white/5 border border-white/10 rounded-2xl p-4 text-left mb-6">
                  <p class="text-[11px] font-bold uppercase tracking-wider text-white/35 mb-3">{{ langStore.t.welcomePrivilegesTitle }}</p>
                  <ul class="space-y-2.5">
                    <li v-for="(f, i) in plan.features" :key="f"
                      class="feature-pop flex items-center gap-2 text-sm text-white/80"
                      :style="{ animationDelay: `${300 + i * 100}ms` }">
                      <BIcon name="Check" class="w-4 h-4 flex-shrink-0" :class="plan.color" />
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

.save-card-checkbox {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  accent-color: #4C67CF;
  flex-shrink: 0;
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
