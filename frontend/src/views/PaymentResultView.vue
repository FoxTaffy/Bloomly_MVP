<script setup lang="ts">
// Сюда ЮKassa возвращает пользователя после оплаты (successURL = /payment/result?id=…).
// Возврат не означает зачисление: статус меняет только уведомление шлюза, поэтому опрашиваем сервер.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useLangStore, LANG_TO_LOCALE } from '@/stores/lang'
import { useAuthStore } from '@/stores/auth'
import { useWalletStore } from '@/stores/wallet'
import { useUserStore } from '@/stores/user'
import { usePaymentsStore, type PaymentInfo } from '@/stores/payments'
import { apiErrorStatus } from '@/lib/apiError'
import AppHeader from '@/components/AppHeader.vue'
import BIcon from '@/components/BIcon.vue'

const route = useRoute()
const langStore = useLangStore()
const auth = useAuthStore()
const walletStore = useWalletStore()
const userStore = useUserStore()
const payments = usePaymentsStore()

const paymentId = String(route.query.id ?? '')
const payment = ref<PaymentInfo | null>(null)
const notFound = ref(false)
const gaveUp = ref(false)
const confirming = ref(false)
const isDev = import.meta.env.DEV

const POLL_MS = 2500
const POLL_LIMIT = 48 // ~2 минуты, дальше — «зачислим автоматически»
let attempts = 0
let timer: ReturnType<typeof setTimeout> | null = null

const status = computed(() => payment.value?.status ?? 'pending')
const expiresLabel = computed(() => {
  const d = auth.user?.subscription_expires_at
  return d ? new Date(d).toLocaleDateString(LANG_TO_LOCALE[langStore.currentLang], { day: 'numeric', month: 'long', year: 'numeric' }) : ''
})

async function onSucceeded() {
  await Promise.all([
    auth.fetchMe(),
    walletStore.fetchBalance().catch(() => {}),
    // Донат выдаёт значок спонсора — подтягиваем свежий профиль, чтобы он сразу появился
    payment.value?.purpose === 'donation' ? userStore.fetchMyProfile() : Promise.resolve(),
  ])
}

async function poll() {
  try {
    payment.value = await payments.getPayment(paymentId)
  } catch (e) {
    if (apiErrorStatus(e) === 404) { notFound.value = true; return }
  }
  if (status.value === 'succeeded' || status.value === 'refunded') return onSucceeded()
  if (status.value !== 'pending') return
  if (++attempts >= POLL_LIMIT) { gaveUp.value = true; return }
  timer = setTimeout(poll, POLL_MS)
}

async function devConfirm() {
  confirming.value = true
  try {
    payment.value = await payments.devConfirm(paymentId)
    if (status.value === 'succeeded') await onSucceeded()
  } finally {
    confirming.value = false
  }
}

onMounted(() => {
  if (!paymentId) { notFound.value = true; return }
  poll()
})
onUnmounted(() => { if (timer) clearTimeout(timer) })
</script>

<template>
  <div class="min-h-screen bg-brand-bg text-white font-nunito">
    <AppHeader />
    <main class="max-w-md mx-auto px-4 pt-28 pb-20">
      <div class="bg-brand-card border border-brand-border rounded-3xl p-8 text-center stack-y-4">

        <template v-if="notFound">
          <BIcon name="SearchX" class="w-12 h-12 mx-auto text-white/40" />
          <h1 class="text-xl font-extrabold">{{ langStore.t.payResultNotFound }}</h1>
        </template>

        <template v-else-if="payment?.purpose === 'card_binding' && (status === 'succeeded' || status === 'refunded')">
          <div class="w-16 h-16 mx-auto rounded-full bg-brand-success/15 flex items-center justify-center">
            <BIcon name="CreditCard" class="w-9 h-9 text-brand-success" />
          </div>
          <h1 class="text-xl font-extrabold">{{ langStore.t.payResultCardBoundTitle }}</h1>
          <p class="text-sm text-white/60">{{ langStore.t.payResultCardBoundDesc }}</p>
        </template>

        <template v-else-if="status === 'succeeded'">
          <div class="w-16 h-16 mx-auto rounded-full bg-brand-success/15 flex items-center justify-center">
            <BIcon name="CheckCircle2" class="w-9 h-9 text-brand-success" />
          </div>
          <h1 class="text-xl font-extrabold">{{ langStore.t.payResultSuccessTitle }}</h1>
          <p v-if="payment?.purpose === 'wallet_topup'" class="text-sm text-white/60">
            {{ langStore.t.payResultTopupDesc }} {{ payment.bc?.toFixed(2) }} Blooms
          </p>
          <p v-else-if="payment?.purpose === 'donation'" class="text-sm text-white/60">
            {{ langStore.t.payResultDonationDesc }}
          </p>
          <p v-else-if="expiresLabel" class="text-sm text-white/60">
            {{ langStore.t.payResultSubDesc }} {{ expiresLabel }}
          </p>
        </template>

        <template v-else-if="status === 'review'">
          <BIcon name="ShieldAlert" class="w-12 h-12 mx-auto text-amber-400" />
          <h1 class="text-xl font-extrabold">{{ langStore.t.payResultReviewTitle }}</h1>
          <p class="text-sm text-white/60">{{ langStore.t.payResultReviewDesc }}</p>
        </template>

        <template v-else-if="status === 'expired'">
          <BIcon name="Clock" class="w-12 h-12 mx-auto text-white/40" />
          <h1 class="text-xl font-extrabold">{{ langStore.t.payResultExpiredTitle }}</h1>
          <p class="text-sm text-white/60">{{ langStore.t.payResultExpiredDesc }}</p>
        </template>

        <template v-else>
          <span v-if="!gaveUp" class="block w-10 h-10 mx-auto border-2 border-white/15 border-t-brand-accent rounded-full animate-spin" />
          <BIcon v-else name="Clock" class="w-12 h-12 mx-auto text-white/40" />
          <h1 class="text-xl font-extrabold">{{ langStore.t.payResultPendingTitle }}</h1>
          <p class="text-sm text-white/60">{{ langStore.t.payResultPendingDesc }}</p>
          <button v-if="isDev" :disabled="confirming" @click="devConfirm"
            class="px-4 py-2 rounded-xl border border-dashed border-amber-400/40 text-xs font-bold text-amber-400 disabled:opacity-40">
            {{ langStore.t.payDevConfirm }}
          </button>
        </template>

        <p v-if="paymentId && !notFound" class="text-[11px] text-white/30 font-mono break-all">
          {{ langStore.t.payPaymentId }}: {{ paymentId }}
        </p>

        <div class="grid grid-cols-2 gap-2 pt-2">
          <RouterLink :to="{ name: 'subscriptions' }"
            class="py-2.5 rounded-2xl border border-brand-border text-sm font-bold text-white/70 hover:text-white transition-all">
            {{ langStore.t.payResultToSubs }}
          </RouterLink>
          <RouterLink :to="auth.user ? `/profile/${auth.user.username}` : '/'"
            class="py-2.5 rounded-2xl bg-brand-accent text-sm font-bold text-white hover:brightness-110 transition-all">
            {{ langStore.t.payResultToProfile }}
          </RouterLink>
        </div>
      </div>
    </main>
  </div>
</template>
