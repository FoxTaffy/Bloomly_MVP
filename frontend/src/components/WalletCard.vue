<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useWalletStore } from '@/stores/wallet'
import { usePaymentsStore } from '@/stores/payments'
import { useLangStore } from '@/stores/lang'
import { apiErrorMessage } from '@/lib/apiError'
import BIcon from '@/components/BIcon.vue'
import AdRequestModal from '@/components/ads/AdRequestModal.vue'

const walletStore = useWalletStore()
const paymentsStore = usePaymentsStore()
const langStore = useLangStore()

const showModal = ref(false)
const showAdModal = ref(false)
const showTopupPicker = ref(false)
const toppingUp = ref(false)
const customTopup = ref<number | null>(null)

const TOPUP_FALLBACK_PACKAGES = [100, 500, 1000, 2500, 5000].map((n) => ({ bc: n, rub: n, popular: false }))
const topupPackages = computed(() => paymentsStore.config?.enabled ? paymentsStore.config.topup.packages : TOPUP_FALLBACK_PACKAGES)
const customTopupValid = computed(() => {
  const lim = paymentsStore.config?.topup
  const v = customTopup.value
  return !!lim && Number.isInteger(v) && v! >= lim.min && v! <= lim.max && v! % lim.step === 0
})

onMounted(() => { walletStore.fetchBalance().catch(() => {}) })

function openModal() {
  showModal.value = true
  showTopupPicker.value = false
  walletStore.fetchBalance().catch(() => {})
  paymentsStore.fetchConfig().catch(() => {})
}

// Форму пополнения открывают и снаружи — например, чат, когда на оплату заказа не хватило денег
defineExpose({ openModal, startTopupPicker: () => { showTopupPicker.value = true } })

async function topupWallet(amount: number) {
  if (toppingUp.value) return
  toppingUp.value = true
  try {
    if (paymentsStore.config?.enabled) {
      await paymentsStore.startTopup(amount, 'AC')
      return
    }
    await walletStore.topup(amount)
    showTopupPicker.value = false
  } catch (e) {
    alert(apiErrorMessage(e) || langStore.t.profileWalletTopupFailedError)
  } finally {
    toppingUp.value = false
  }
}
</script>

<template>
  <button type="button" @click="openModal"
    class="relative overflow-hidden w-full text-left bg-linear-to-br/srgb from-brand-accent/15 to-brand-accent-plus/15 border border-brand-accent/25 hover:border-brand-accent/50 rounded-2xl px-4 py-2.5 transition-all hover:scale-[1.01] group">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-7 h-7 rounded-xl bg-brand-accent/20 flex items-center justify-center shrink-0">
          <BIcon name="Wallet" class="w-3.5 h-3.5 text-brand-accent" />
        </div>
        <div class="min-w-0">
          <p class="text-[10px] font-bold uppercase tracking-widest text-white/55 leading-none">{{ langStore.t.walletLabel }}</p>
          <p class="flex items-baseline gap-1 mt-1">
            <span class="text-lg font-extrabold text-white leading-none">{{ walletStore.balance.toFixed(2) }}</span>
            <span class="text-[11px] font-semibold text-brand-accent-minus">BLM</span>
          </p>
        </div>
      </div>
      <BIcon name="ChevronRight" class="w-4 h-4 text-white/55 group-hover:text-brand-accent transition-colors shrink-0" />
    </div>
  </button>

  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showModal" class="fixed inset-0 z-400 bg-black/60 backdrop-blur-xs flex items-center justify-center px-4" @click.self="showModal = false">
        <div class="w-full max-w-sm bg-brand-card border border-brand-border rounded-3xl shadow-2xl overflow-hidden">
          <div class="flex items-center justify-between px-6 py-4 border-b border-brand-border">
            <div class="flex items-center gap-2.5">
              <BIcon name="Wallet" class="w-5 h-5 text-brand-accent" />
              <h3 class="text-xl font-extrabold text-white">{{ langStore.t.walletLabel }}</h3>
            </div>
            <button @click="showModal = false" class="w-8 h-8 flex items-center justify-center rounded-xl text-white/55 hover:text-white hover:bg-brand-bg transition-all">
              <BIcon name="X" class="w-4 h-4" />
            </button>
          </div>
          <div class="p-6 stack-y-4">
            <div class="relative overflow-hidden rounded-2xl bg-linear-to-br/srgb from-brand-accent/20 to-brand-accent-plus/20 border border-brand-accent/25 p-6 text-center">
              <p class="text-xs font-bold text-brand-accent uppercase tracking-widest mb-2 relative">{{ langStore.t.balanceLabel }}</p>
              <p class="text-4xl font-extrabold text-white leading-none relative">{{ walletStore.balance.toFixed(2) }}</p>
              <p class="flex items-center justify-center gap-1 text-sm text-brand-accent-minus font-semibold mt-1 relative">
                <BIcon name="Flower2" class="w-3.5 h-3.5" /> BLM
              </p>
              <p class="text-[11px] text-white/45 mt-1 relative">1 BLM = $1</p>
              <p v-if="walletStore.promoBalance > 0" class="text-[11px] text-amber-300/90 mt-2 relative" :title="'Бонусные BLM тратятся только на услуги площадки: баннеры, поднятия, бусты. Вывести их нельзя'">
                + {{ walletStore.promoBalance.toFixed(2) }} Promo BLM
              </p>
            </div>

            <div v-if="showTopupPicker" class="bg-brand-bg border border-brand-border rounded-2xl p-4 stack-y-3">
              <p class="text-xs font-bold text-white/55">{{ langStore.t.profileTopupPresetLabel }}</p>
              <div class="grid grid-cols-2 gap-2">
                <button v-for="pkg in topupPackages" :key="pkg.rub" :disabled="toppingUp" @click="topupWallet(pkg.rub)"
                  class="relative py-3 rounded-xl border bg-brand-card text-center transition-all disabled:opacity-40 hover:border-brand-accent/60"
                  :class="pkg.popular ? 'border-brand-accent shadow-[0_0_0_1px_rgba(76,103,207,.5)]' : 'border-brand-border'">
                  <span v-if="pkg.popular" class="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-brand-accent text-[9px] font-extrabold uppercase tracking-wide text-white whitespace-nowrap">{{ langStore.t.topupPopular }}</span>
                  <span class="block text-base font-extrabold text-white">{{ pkg.bc }} BLM</span>
                  <span class="block text-xs font-semibold text-white/50">{{ pkg.rub }} ₽</span>
                </button>
              </div>
              <div v-if="paymentsStore.config?.enabled" class="flex gap-2">
                <input v-model.number="customTopup" type="number" inputmode="numeric"
                  :min="paymentsStore.config.topup.min" :max="paymentsStore.config.topup.max" :step="paymentsStore.config.topup.step"
                  :placeholder="`${langStore.t.profileTopupCustom} (${paymentsStore.config.topup.min}–${paymentsStore.config.topup.max})`"
                  class="flex-1 min-w-0 px-3 py-2 rounded-xl border border-brand-border bg-brand-card text-sm text-white placeholder-white/30 focus:outline-hidden focus:border-brand-accent/50" />
                <button :disabled="toppingUp || !customTopupValid" @click="topupWallet(customTopup!)"
                  class="px-4 py-2 rounded-xl bg-brand-accent text-sm font-bold text-white disabled:opacity-40 transition-all">
                  {{ langStore.t.profileTopupPay }}
                </button>
              </div>
              <button @click="showTopupPicker = false" class="w-full py-1.5 text-xs font-semibold text-white/40 hover:text-white transition-colors">{{ langStore.t.cancel }}</button>
            </div>

            <div v-else class="grid grid-cols-2 gap-3">
              <button @click="showTopupPicker = true" class="flex flex-col items-center gap-1.5 p-4 rounded-2xl border border-brand-border bg-brand-bg/50 hover:border-brand-accent/50 transition-all">
                <BIcon name="Plus" class="w-5 h-5 text-brand-accent" />
                <span class="text-xs font-bold text-white">{{ langStore.t.topUpBtn }}</span>
              </button>
              <button disabled class="flex flex-col items-center gap-1.5 p-4 rounded-2xl border border-brand-border bg-brand-bg/50 opacity-50 cursor-not-allowed">
                <BIcon name="ArrowUpRight" class="w-5 h-5 text-white/55" />
                <span class="text-xs font-bold text-white/55">{{ langStore.t.withdrawBtn }}</span>
              </button>
            </div>
            <button v-if="!showTopupPicker" @click="showModal = false; showAdModal = true"
              class="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-brand-border bg-brand-bg/50 hover:border-brand-accent/50 text-xs font-bold text-white/80 transition-all">
              <BIcon name="Megaphone" class="w-4 h-4 text-brand-accent" /> Разместить рекламу
            </button>
            <p class="text-center text-[11px] text-white/35">
              {{ paymentsStore.config?.enabled ? langStore.t.profileTopupDisclaimerReal : langStore.t.profileTopupDisclaimer }}
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
  <AdRequestModal v-model="showAdModal" />
</template>
