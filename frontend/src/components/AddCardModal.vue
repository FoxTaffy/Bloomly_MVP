<script setup lang="ts">
import { apiErrorMessage } from '@/lib/apiError'
import { ref, computed } from 'vue'
import { useLangStore } from '@/stores/lang'
import { useAuthStore } from '@/stores/auth'
import BIcon from '@/components/BIcon.vue'
import CardFlipInput from '@/components/CardFlipInput.vue'
import api from '@/api'
import type { PaymentMethod } from '@/types/paymentMethod'
import { allowedCardBrandsForRegion } from '@/lib/paymentRegions'
import { cardBrandInfo } from '@/lib/cardBrand'

const emit = defineEmits<{ close: []; added: [method: PaymentMethod] }>()

const langStore = useLangStore()
const authStore = useAuthStore()

const allowedBrandLabels = computed(() =>
  allowedCardBrandsForRegion(authStore.user?.payment_region).map((b) => cardBrandInfo(b).label).join(' · ')
)

const cardNum  = ref('')
const cardExp  = ref('')
const cardCvv  = ref('')
const cardName = ref('')
const flipped  = ref(false)
const sending  = ref(false)
const errorMsg = ref('')

const cardValid = computed(() =>
  cardNum.value.replace(/\s/g, '').length === 16 &&
  cardExp.value.length === 5 &&
  cardCvv.value.length >= 3 &&
  cardName.value.trim().length >= 2
)

async function save() {
  if (!cardValid.value || sending.value) return
  sending.value = true
  errorMsg.value = ''
  try {
    const [expMonth, expYear] = cardExp.value.split('/')
    const res = await api.post('/users/me/payment-methods', {
      cardNumber: cardNum.value,
      expMonth: Number(expMonth),
      expYear: 2000 + Number(expYear),
      holderName: cardName.value,
    })
    emit('added', res.data.data)
    emit('close')
  } catch (e) {
    errorMsg.value = apiErrorMessage(e) || langStore.t.subToastError
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pay-fade" appear>
      <div class="fixed inset-0 z-700 flex items-end sm:items-center justify-center" @click.self="emit('close')">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-xs" @click="emit('close')" />

        <div class="relative w-full sm:max-w-sm bg-[#13131f] border border-white/8 rounded-t-3xl sm:rounded-3xl overflow-hidden z-10 modal-glow">
          <div class="h-1 w-full bg-linear-to-r/srgb from-brand-accent via-brand-purple to-brand-pink" />
          <div class="w-10 h-1 bg-white/10 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

          <div class="px-6 pt-5 pb-6 stack-y-5">
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-extrabold text-white">{{ langStore.t.billingAddCard }}</h2>
              <button @click="emit('close')"
                class="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all active:scale-90 shrink-0">
                <BIcon name="X" class="w-4 h-4" />
              </button>
            </div>

            <CardFlipInput
              v-model:card-num="cardNum" v-model:card-exp="cardExp"
              v-model:card-cvv="cardCvv" v-model:card-name="cardName"
              v-model:flipped="flipped" />

            <p class="flex items-center justify-center gap-1.5 text-[11px] text-white/35">
              <BIcon name="Info" class="w-3 h-3 shrink-0" />
              {{ langStore.t.payModalRegionHint }}: {{ allowedBrandLabels }}
            </p>

            <p v-if="errorMsg" class="text-xs text-brand-error text-center">{{ errorMsg }}</p>

            <button
              @click="save"
              :disabled="!cardValid || sending"
              class="w-full py-4 rounded-2xl text-base font-extrabold text-white transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.97] hover:brightness-110 shadow-lg shadow-brand-accent/30"
              style="background: linear-gradient(135deg, #4C67CF 0%, #7C6FDB 55%, #CD83F5 100%);">
              <BIcon v-if="sending" name="Loader2" class="w-5 h-5 animate-spin" />
              <BIcon v-else name="Lock" class="w-4 h-4" />
              {{ langStore.t.billingAddCard }}
            </button>

            <div class="flex items-center justify-center gap-2 text-[11px] text-white/25">
              <BIcon name="Shield" class="w-3.5 h-3.5" />
              {{ langStore.t.payModalSecure }}
            </div>
          </div>
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
</style>
