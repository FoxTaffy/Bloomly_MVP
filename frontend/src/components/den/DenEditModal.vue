<script setup lang="ts">
import { ref, computed } from 'vue'
import type { DealerListing } from '@/stores/dealersDen'
import { useDealersDenStore } from '@/stores/dealersDen'
import { useLangStore } from '@/stores/lang'
import { useConfirm } from '@/composables/useConfirm'
import { apiErrorMessage } from '@/lib/apiError'
import { isResultDriven } from '@/lib/denKinds'
import { draftFrom, cleanDraft } from '@/lib/listingDetails'
import { supportsDiscount, clampDiscount } from '@/lib/listingDiscount'
import { LISTING_CURRENCIES } from '@/lib/denForm'
import BIcon from '@/components/BIcon.vue'
import ModalShell from '@/components/ui/ModalShell.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import DenDiscountField from '@/components/DenDiscountField.vue'
import ListingDetailsEditor from '@/components/ListingDetailsEditor.vue'

const props = defineProps<{ listing: DealerListing }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useDealersDenStore()
const t = computed(() => useLangStore().t)
const { confirmDialog } = useConfirm()

const l = props.listing
const kind = l.listing_kind
const details = ref(draftFrom(l.commission_details))
const form = ref({
  title: l.title, description: l.description ?? '',
  price: parseFloat(String(l.price)), discountPercent: l.discount_percent ?? 0, currency: l.currency,
  quantity: l.quantity, commissionSlotsTotal: l.commission_slots_total ?? 1, status: l.status as string,
  tags: l.tags.join(', '), isNsfw: l.is_nsfw,
})
// Уже загруженные фото (их можно убрать) и то, что добавлено в этой сессии
const keptImages = ref<string[]>([...l.images])
const newImages = ref<string[]>([])

// Исход торгов и розыгрыша решают ставки и билеты; после первой ставки цену не меняют (сервер тоже не даст)
const lockedStatus = isResultDriven(kind)
const lockedPrice = (kind === 'auction' || kind === 'ych') && l.bid_count > 0
const statuses = computed(() => [
  { v: 'active', l: t.value.dealersDenStatusActiveLabel },
  ...(lockedStatus ? [] : [{ v: 'sold', l: t.value.dealersDenSoldBadge }]),
  { v: 'draft', l: t.value.dealersDenDraftBadge },
  { v: 'archived', l: t.value.archiveBtn },
])

const busy = ref(false)
const error = ref('')

async function tryClose() {
  if (!(await confirmDialog(t.value.dealersDenUnsavedCloseConfirmShort))) return
  emit('close')
}

async function submit() {
  busy.value = true
  error.value = ''
  try {
    await store.updateListing(l.id, {
      title: form.value.title, description: form.value.description,
      ...(lockedPrice ? {} : { price: form.value.price, currency: form.value.currency }),
      discountPercent: supportsDiscount(kind) ? clampDiscount(form.value.discountPercent) : 0,
      quantity: kind === 'commission_queue' ? undefined : form.value.quantity,
      commissionSlotsTotal: kind === 'commission_queue' ? Number(form.value.commissionSlotsTotal) : undefined,
      status: form.value.status as DealerListing['status'],
      tags: form.value.tags.split(',').map(x => x.trim()).filter(Boolean),
      isNsfw: form.value.isNsfw,
      commissionDetails: cleanDraft(details.value, kind === 'commission_queue'),
      images: [...keptImages.value, ...newImages.value],
    })
    emit('saved')
    emit('close')
  } catch (err) {
    error.value = apiErrorMessage(err) ?? t.value.dealersDenSaveChangesFailed
  } finally { busy.value = false }
}
</script>

<template>
  <ModalShell :title="t.dealersDenEditTitle" subtitle="Dealers' Den · Bloomly" :close-on-backdrop="false" @close="tryClose" @backdrop="() => {}">
    <div>
      <label class="field-label">{{ t.dealersDenTitleLabel }}</label>
      <input v-model="form.title" maxlength="200" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
    </div>
    <div>
      <div class="flex items-center justify-between mb-2">
        <label class="field-label !mb-0">{{ t.fursuitDescLabel }}</label>
        <span class="text-[11px] tabular-nums" :class="form.description.length > 440 ? 'text-brand-error/80' : 'text-white/35'">{{ form.description.length }}<span class="opacity-50">/500</span></span>
      </div>
      <textarea v-model="form.description" rows="3" maxlength="500" class="w-full px-4 py-3 text-sm text-white outline-hidden resize-none" />
    </div>
    <div>
      <label class="field-label">{{ t.dealersDenPhotosLabel }}</label>
      <div v-if="keptImages.length" class="flex gap-2 flex-wrap mb-3">
        <div v-for="(url, i) in keptImages" :key="url" class="relative w-16 h-16 rounded-xl overflow-hidden border border-white/10">
          <img :src="url" class="w-full h-full object-cover" />
          <button type="button" @click="keptImages.splice(i, 1)"
            class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center hover:bg-brand-error transition-all">
            <BIcon name="X" class="w-3 h-3 text-white" />
          </button>
        </div>
      </div>
      <MediaUpload type="posts" :multiple="true" :max-files="20" @uploaded="(urls: string[]) => { newImages = urls }" />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="field-label">{{ t.dealersDenPriceLabel }}</label>
        <input v-model.number="form.price" type="number" min="0" step="0.01" :disabled="lockedPrice" class="w-full px-4 py-3 text-sm text-white outline-hidden disabled:opacity-50" />
      </div>
      <div>
        <label class="field-label">{{ t.dealersDenCurrencyLabel }}</label>
        <select v-model="form.currency" :disabled="lockedPrice" class="w-full px-4 py-3 text-sm text-white outline-hidden appearance-none disabled:opacity-50">
          <option v-for="c in LISTING_CURRENCIES" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>
    </div>
    <p v-if="lockedPrice" class="-mt-2 text-[11px] text-white/35">Цену и валюту нельзя менять после первой ставки.</p>
    <DenDiscountField v-if="supportsDiscount(kind)" v-model="form.discountPercent" :price="Number(form.price)" :currency="form.currency" />

    <div class="grid grid-cols-2 gap-3">
      <div v-if="kind === 'commission_queue'">
        <label class="field-label">{{ t.dealersDenCommissionSlotsLabel }}</label>
        <input v-model.number="form.commissionSlotsTotal" type="number" min="1" max="1000" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
      </div>
      <div v-else>
        <label class="field-label">{{ t.dealersDenQuantityLabel }}</label>
        <input v-model.number="form.quantity" type="number" min="1" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
      </div>
      <div>
        <label class="field-label">{{ t.statusFieldLabel }}</label>
        <select v-model="form.status" class="w-full px-4 py-3 text-sm text-white outline-hidden appearance-none" :disabled="lockedStatus && l.status === 'sold'">
          <option v-for="s in statuses" :key="s.v" :value="s.v">{{ s.l }}</option>
          <option v-if="l.status === 'sold' && lockedStatus" value="sold">{{ t.dealersDenSoldBadge }}</option>
        </select>
      </div>
    </div>

    <div>
      <label class="field-label">{{ t.dealersDenTagsLabel }} <span class="normal-case font-normal text-white/20">{{ t.dealersDenTagsHint }}</span></label>
      <input v-model="form.tags" :placeholder="t.dealersDenTagsPlaceholder" class="w-full px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden" />
    </div>

    <ListingDetailsEditor :draft="details" :commission="kind === 'commission_queue'" />

    <div class="flex items-center justify-between p-4 rounded-2xl bg-brand-error/5 border border-brand-error/15">
      <p class="text-sm font-bold text-white">{{ t.dealersDenNsfwContentLabel }}</p>
      <ToggleSwitch v-model="form.isNsfw" />
    </div>

    <div v-if="error" class="text-brand-error text-xs font-medium bg-brand-error/10 border border-brand-error/20 rounded-xl px-4 py-3">{{ error }}</div>
    <div class="flex gap-3">
      <button @click="tryClose" class="px-5 py-3 border border-white/8 text-white/40 text-sm font-bold rounded-2xl transition-all hover:bg-white/5 hover:text-white">{{ t.cancel }}</button>
      <button @click="submit" :disabled="busy"
        class="flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-35 text-white text-sm font-bold rounded-2xl transition-all hover:opacity-90 bg-brand-gradient">
        <span v-if="busy" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        <BIcon v-else name="Check" class="w-4 h-4" />
        {{ busy ? t.savingLabel : t.dealersDenSaveBtn }}
      </button>
    </div>
  </ModalShell>
</template>
