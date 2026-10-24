<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DealerListing } from '@/stores/dealersDen'
import { useDealersDenStore } from '@/stores/dealersDen'
import { useLangStore } from '@/stores/lang'
import { apiErrorMessage } from '@/lib/apiError'
import * as fmt from '@/lib/format'
import BIcon from '@/components/BIcon.vue'
import ModalShell from '@/components/ui/ModalShell.vue'
import DenCountdown from '@/components/DenCountdown.vue'

const props = defineProps<{ listing: DealerListing }>()
const emit = defineEmits<{ close: []; placed: [] }>()

const store = useDealersDenStore()
const t = computed(() => useLangStore().t)

const current = computed(() => parseFloat(String(props.listing.current_bid ?? props.listing.price)))
const step = computed(() => parseFloat(String(props.listing.bid_increment ?? 1)))
const minBid = computed(() => Math.round((current.value + (props.listing.current_bid ? step.value : 0)) * 100) / 100)

const amount = ref(Math.round((current.value + step.value) * 100) / 100)
const message = ref('')
const busy = ref(false)
const error = ref('')

// Автовыкуп: ставка от этой цены сразу закрывает торги
const autoBuy = computed(() => (props.listing.auto_buy_price ? parseFloat(String(props.listing.auto_buy_price)) : null))
const wouldBuyNow = computed(() => autoBuy.value !== null && amount.value >= autoBuy.value)

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await store.placeBid(props.listing.id, amount.value, message.value || undefined)
    emit('placed')
    emit('close')
  } catch (err) {
    error.value = apiErrorMessage(err) ?? t.value.dealersDenGenericRetryError
  } finally { busy.value = false }
}
</script>

<template>
  <ModalShell :title="t.dealersDenPlaceBidTitle" :subtitle="listing.title" width="max-w-md" @close="emit('close')">
    <div class="flex items-center justify-between bg-brand-yellow/8 border border-brand-yellow/15 rounded-2xl p-4">
      <div>
        <p class="text-[9px] text-white/30 uppercase tracking-wider mb-1">{{ t.dealersDenCurrentBid }}</p>
        <p class="text-brand-yellow font-extrabold text-2xl tabular-nums leading-none">{{ fmt.formatPrice(listing.current_bid ?? listing.price, listing.currency) }}</p>
        <p class="text-xs text-white/25 mt-1.5">{{ t.dealersDenBidsCountLabel }} {{ listing.bid_count ?? 0 }}</p>
      </div>
      <div class="text-right">
        <p class="text-[9px] text-white/30 uppercase tracking-wider mb-1">{{ t.dealersDenUntilEndLabel }}</p>
        <DenCountdown v-slot="{ text, hot }" :ends-at="listing.auction_ends_at ?? null">
          <p class="text-xl font-black tabular-nums" :class="hot ? 'text-brand-error' : 'text-white'">{{ text || '—' }}</p>
        </DenCountdown>
      </div>
    </div>

    <div>
      <label class="field-label">
        {{ t.dealersDenYourBidLabel }}
        <span class="text-white/20 normal-case font-normal">({{ t.dealersDenMinPrefix }} {{ fmt.formatPrice(minBid.toFixed(2), listing.currency) }})</span>
      </label>
      <div class="relative">
        <input v-model.number="amount" type="number" :min="minBid" step="0.01" class="w-full px-4 py-3 pr-16 text-sm text-white outline-hidden" />
        <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/20 font-bold">{{ listing.currency }}</span>
      </div>
      <p v-if="wouldBuyNow" class="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-brand-yellow">
        <BIcon name="Zap" class="w-3.5 h-3.5" /> {{ t.dealersDenBuyNowShort }}: торги закроются сразу
      </p>
      <p v-else class="mt-2 text-[11px] text-white/30">Ставка в последние 5 минут продлевает торги ещё на 5 минут</p>
    </div>

    <div>
      <label class="field-label">{{ t.helpMessageLabel }} <span class="text-white/15 normal-case font-normal">{{ t.dealersDenOptionalHint }}</span></label>
      <textarea v-model="message" rows="2" maxlength="500" :placeholder="t.dealersDenBidMessagePlaceholder"
        class="w-full px-4 py-3 text-sm text-white placeholder-white/15 outline-hidden resize-none" />
    </div>

    <div v-if="error" class="text-brand-error text-xs font-medium bg-brand-error/8 border border-brand-error/15 rounded-xl px-4 py-3">{{ error }}</div>

    <div class="flex gap-3">
      <button @click="emit('close')" class="px-5 py-3 border border-white/8 text-white/40 text-sm font-bold rounded-2xl hover:bg-white/5 hover:text-white transition-all">{{ t.cancel }}</button>
      <button @click="submit" :disabled="busy || !(amount >= minBid)"
        class="flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-35 text-white text-sm font-extrabold rounded-2xl transition-all hover:opacity-90 shadow-lg bg-linear-to-br from-brand-yellow to-brand-warning">
        <span v-if="busy" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        <BIcon v-else name="Hammer" class="w-4 h-4" />
        {{ busy ? t.helpSubmitting : t.dealersDenConfirmBidBtn }}
      </button>
    </div>
  </ModalShell>
</template>
