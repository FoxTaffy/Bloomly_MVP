<template>
  <div class="bg-brand-card border border-brand-border rounded-3xl overflow-hidden shadow-xl">
    <!-- Header -->
    <div class="relative overflow-hidden px-5 py-4" style="background: linear-gradient(135deg, #1e0f40, #0e0720)">
      <div class="absolute -top-4 -right-4 w-24 h-24 rounded-full blur-2xl opacity-30" style="background: #a78bfa" />
      <div class="relative z-10">
        <div class="flex items-center gap-2 mb-1">
          <BIcon name="ListOrdered" class="w-4 h-4 text-violet-400" />
          <span class="text-xs font-extrabold text-violet-400 uppercase tracking-widest">Очередь комиссий</span>
          <span v-if="listing.commission_eta_days" class="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-bold">
            ~{{ listing.commission_eta_days }} дн.
          </span>
        </div>
        <p class="text-[10px] text-white/35">Занимай место и жди своей очереди</p>
      </div>
    </div>

    <div class="p-5 space-y-4">
      <!-- Slots progress -->
      <div v-if="listing.commission_slots_total" class="space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-white/45">Занято слотов</span>
          <span class="font-bold text-white">
            {{ listing.commission_slots_taken }}
            <span class="text-white/30"> / {{ listing.commission_slots_total }}</span>
          </span>
        </div>
        <div class="h-2 bg-white/8 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500"
            :style="`width: ${slotsFillPct}%; background: linear-gradient(90deg, #a78bfa, #7c3aed)`" />
        </div>
        <div v-if="isFull" class="flex items-center gap-2 bg-brand-error/10 border border-brand-error/20 rounded-xl px-3 py-2">
          <BIcon name="XCircle" class="w-4 h-4 text-brand-error flex-shrink-0" />
          <span class="text-xs font-bold text-brand-error">Все слоты заняты</span>
        </div>
      </div>

      <!-- Form fields -->
      <div v-if="listing.commission_form_fields?.length" class="space-y-3">
        <p class="text-[10px] font-bold text-white/35 uppercase tracking-wider">Информация о заказе</p>
        <div v-for="field in listing.commission_form_fields" :key="field.label" class="space-y-1.5">
          <label class="text-xs text-white/60 font-medium">
            {{ field.label }}<span v-if="field.required" class="text-brand-error ml-1">*</span>
          </label>
          <textarea v-if="field.type === 'textarea'" v-model="formData[field.label]" rows="2"
            class="w-full bg-[#0a0a1a] border border-white/8 rounded-xl px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-violet-500/50 resize-none transition-all"
            :placeholder="field.label" />
          <input v-else v-model="formData[field.label]" type="text"
            class="w-full bg-[#0a0a1a] border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-violet-500/50 transition-all"
            :placeholder="field.label" />
        </div>
      </div>

      <!-- Action -->
      <div v-if="!isFull">
        <button v-if="canBook" @click="book" :disabled="booking"
          class="w-full flex items-center justify-center gap-2 py-3.5 text-white font-extrabold rounded-2xl transition-all hover:opacity-90 active:scale-[0.98] text-sm"
          style="background: linear-gradient(135deg, #a78bfa, #7c3aed)">
          <BIcon name="ListOrdered" class="w-4 h-4" />
          {{ booking ? 'Бронируем…' : 'Забронировать слот' }}
        </button>
        <button v-else-if="!isLoggedIn" @click="router.push({ name: 'login' })"
          class="w-full flex items-center justify-center gap-2 py-3.5 text-white/60 font-bold rounded-2xl border border-brand-border hover:border-violet-500/40 hover:text-white transition-all text-sm">
          <BIcon name="LogIn" class="w-4 h-4" /> Войти для бронирования
        </button>
        <div v-else-if="isOwnListing" class="text-center text-xs text-white/25 py-2">
          Это ваш лот
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import BIcon from '@/components/BIcon.vue'
import { useDealersDenStore, type DealerListing } from '../stores/dealersDen'
import { useAuthStore } from '../stores/auth'

const props = defineProps<{ listing: DealerListing }>()
const emit  = defineEmits<{ (e: 'booked', data: { booking: any; queuePosition: number }): void }>()

const store   = useDealersDenStore()
const auth    = useAuthStore()
const router  = useRouter()
const booking = ref(false)
const formData = ref<Record<string, string>>({})

const isLoggedIn  = computed(() => !!auth.user)
const isOwnListing = computed(() => auth.user?.id === props.listing.seller_id)
const isFull = computed(() => {
  const total = props.listing.commission_slots_total
  return total !== null && total !== undefined && props.listing.commission_slots_taken >= total
})
const canBook = computed(() =>
  isLoggedIn.value && !isOwnListing.value && props.listing.status === 'active'
)
const slotsFillPct = computed(() => {
  const total = props.listing.commission_slots_total
  if (!total) return 0
  return Math.min(100, (props.listing.commission_slots_taken / total) * 100)
})

async function book() {
  if (booking.value) return
  booking.value = true
  try {
    const result = await store.createBooking(props.listing.id, formData.value)
    emit('booked', result)
  } finally {
    booking.value = false
  }
}
</script>
