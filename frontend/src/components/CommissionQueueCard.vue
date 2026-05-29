<template>
  <div class="commission-card">
    <div class="commission-header">
      <span class="label">Очередь комиссий</span>
      <span class="eta" v-if="listing.commission_eta_days">~{{ listing.commission_eta_days }} дн.</span>
    </div>

    <div class="slots-bar">
      <div class="slots-track">
        <div class="slots-fill" :style="{ width: slotsFillPct + '%' }" />
      </div>
      <span class="slots-text">
        <strong>{{ listing.commission_slots_taken }}</strong> / {{ listing.commission_slots_total ?? '∞' }} слотов занято
      </span>
    </div>

    <div v-if="isFull" class="slots-full">Все слоты заняты</div>

    <div v-if="listing.commission_form_fields?.length" class="form-fields">
      <div v-for="field in listing.commission_form_fields" :key="field.label" class="field">
        <label class="field-label">
          {{ field.label }}
          <span v-if="field.required" class="required">*</span>
        </label>
        <input v-if="field.type === 'text'" v-model="formData[field.label]" class="field-input" :placeholder="field.label" />
        <textarea v-else-if="field.type === 'textarea'" v-model="formData[field.label]" class="field-input field-textarea" :placeholder="field.label" />
      </div>
    </div>

    <button
      v-if="!isFull && canBook"
      class="book-btn"
      :disabled="booking || !isLoggedIn"
      @click="book"
    >
      {{ booking ? 'Бронируем...' : 'Забронировать слот' }}
    </button>

    <div v-if="!isLoggedIn" class="login-hint">Войдите, чтобы забронировать</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDealersDenStore, type DealerListing } from '../stores/dealersDen'
import { useAuthStore } from '../stores/auth'

const props  = defineProps<{ listing: DealerListing }>()
const emit   = defineEmits<{ (e: 'booked', data: { booking: any; queuePosition: number }): void }>()

const store    = useDealersDenStore()
const auth     = useAuthStore()
const booking  = ref(false)
const formData = ref<Record<string, string>>({})

const isLoggedIn = computed(() => !!auth.user)
const isFull = computed(() => {
  const total = props.listing.commission_slots_total
  return total !== null && props.listing.commission_slots_taken >= total
})
const canBook = computed(() => props.listing.status === 'active' && auth.user?.id !== props.listing.seller_id)

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

<style scoped>
.commission-card {
  border: 1.5px solid #e0e7ff;
  border-radius: 14px;
  padding: 16px;
  background: #f5f3ff;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.commission-header { display: flex; align-items: center; justify-content: space-between; }
.label  { font-weight: 700; font-size: 14px; color: #4338ca; }
.eta    { font-size: 12px; color: #7c3aed; background: #ede9fe; padding: 2px 8px; border-radius: 999px; }
.slots-bar { display: flex; flex-direction: column; gap: 6px; }
.slots-track { height: 8px; background: #ddd6fe; border-radius: 99px; overflow: hidden; }
.slots-fill  { height: 100%; background: #7c3aed; border-radius: 99px; transition: width 0.3s; }
.slots-text  { font-size: 13px; color: #6b7280; }
.slots-full  { text-align: center; color: #dc2626; font-weight: 600; font-size: 14px; }
.form-fields { display: flex; flex-direction: column; gap: 8px; }
.field       { display: flex; flex-direction: column; gap: 4px; }
.field-label { font-size: 13px; font-weight: 500; color: #374151; }
.required    { color: #dc2626; margin-left: 2px; }
.field-input {
  padding: 8px 12px;
  border: 1px solid #c4b5fd;
  border-radius: 8px;
  font-size: 14px;
  background: #fff;
  outline: none;
}
.field-input:focus { border-color: #7c3aed; }
.field-textarea { min-height: 80px; resize: vertical; }
.book-btn {
  padding: 10px;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}
.book-btn:hover:not(:disabled) { background: #6d28d9; }
.book-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.login-hint { font-size: 12px; text-align: center; color: #9ca3af; }
</style>
