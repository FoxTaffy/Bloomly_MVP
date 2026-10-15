<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useMessagesStore } from '@/stores/messages'
import { useLangStore } from '@/stores/lang'
import BIcon from '@/components/BIcon.vue'

// Chat-only "order card": the seller asks the buyer to pay an amount, optionally with prepayment and a deadline.
const props = defineProps<{ convId: string; open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'sent'): void }>()
const store = useMessagesStore()
const langStore = useLangStore()

const paymentForm = reactive({ amount: '', description: '', prepaymentPercent: '', deadline: '' })
const sendingPayment = ref(false)

// Every opening starts with an empty form
watch(() => props.open, (open) => {
  if (open) Object.assign(paymentForm, { amount: '', description: '', prepaymentPercent: '', deadline: '' })
})

const closePaymentModal = () => emit('close')

async function submitPaymentRequest() {
  const amount = Number(paymentForm.amount)
  if (!amount || amount <= 0 || sendingPayment.value) return
  sendingPayment.value = true
  try {
    await store.sendPaymentRequest(props.convId, {
      amount,
      description: paymentForm.description.trim(),
      prepaymentPercent: paymentForm.prepaymentPercent ? Number(paymentForm.prepaymentPercent) : undefined,
      deadline: paymentForm.deadline || undefined,
    })
    emit('sent')
    emit('close')
  } catch { /* silent */ }
  sendingPayment.value = false
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" @click.self="closePaymentModal">
        <div class="bg-brand-card border border-brand-border rounded-3xl p-5 w-full max-w-xs shadow-2xl">
          <div class="flex items-center gap-2 mb-4">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-accent/30 to-brand-accent/10 ring-1 ring-brand-accent/30 flex items-center justify-center">
              <BIcon name="CreditCard" class="w-4 h-4 text-brand-accent" />
            </div>
            <h3 class="text-base font-bold text-white">{{ langStore.t.chatPaymentRequestTitle }}</h3>
          </div>
          <div class="flex flex-col gap-3">
            <div>
              <label class="text-[11px] text-white/45 font-semibold">{{ langStore.t.chatAmountLabel }}</label>
              <input v-model="paymentForm.amount" type="number" min="1" placeholder="3500"
                class="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-accent/50" />
            </div>
            <div>
              <label class="text-[11px] text-white/45 font-semibold">{{ langStore.t.fursuitDescLabel }}</label>
              <input v-model="paymentForm.description" type="text" maxlength="300" :placeholder="langStore.t.chatDescPlaceholderExample"
                class="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-accent/50" />
            </div>
            <div>
              <label class="text-[11px] text-white/45 font-semibold">{{ langStore.t.chatPrepaymentLabel }}</label>
              <input v-model="paymentForm.prepaymentPercent" type="number" min="1" max="100" placeholder="50"
                class="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-accent/50" />
            </div>
            <div>
              <label class="text-[11px] text-white/45 font-semibold">{{ langStore.t.chatDeadlineLabel }}</label>
              <input v-model="paymentForm.deadline" type="date"
                class="w-full mt-1 bg-brand-bg border border-brand-border rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-brand-accent/50" />
            </div>
            <button type="button" @click="submitPaymentRequest" :disabled="!paymentForm.amount || sendingPayment"
              class="w-full py-2.5 rounded-xl bg-brand-accent hover:bg-brand-accent-plus text-white text-sm font-semibold transition-all disabled:opacity-40 mt-1">
              {{ sendingPayment ? langStore.t.chatSendingPaymentLabel : langStore.t.chatSendPaymentRequestBtn }}
            </button>
            <button type="button" @click="closePaymentModal" class="w-full py-1 text-sm text-white/45 hover:text-white transition-colors">
              {{ langStore.t.cancel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
