<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDealersDenStore, type ListingKind, type DealerListing } from '@/stores/dealersDen'
import { useLangStore } from '@/stores/lang'
import { apiErrorMessage } from '@/lib/apiError'
import { KIND_META, KIND_ORDER } from '@/lib/denKinds'
import { emptyDraft, cleanDraft } from '@/lib/listingDetails'
import { supportsDiscount, clampDiscount } from '@/lib/listingDiscount'
import { LISTING_CURRENCIES, parseFormFields } from '@/lib/denForm'
import BIcon from '@/components/BIcon.vue'
import ModalShell from '@/components/ui/ModalShell.vue'
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
import MediaUpload from '@/components/MediaUpload.vue'
import DenDiscountField from '@/components/DenDiscountField.vue'
import DenExitConfirmModal from '@/components/DenExitConfirmModal.vue'
import ListingDetailsEditor from '@/components/ListingDetailsEditor.vue'

export interface CreatedInfo { id: string; title: string; image: string | null; isDraft: boolean }

const props = defineProps<{
  groups: { id: string; name: string }[]
  categories: { key: string; label: string; icon: string }[]
}>()
const emit = defineEmits<{ close: []; created: [info: CreatedInfo] }>()

const store = useDealersDenStore()
const t = computed(() => useLangStore().t)

const details = ref(emptyDraft())
const form = ref({
  title: '', description: '', price: 0, discountPercent: 0, currency: 'USD',
  category: 'art' as DealerListing['category'], type: 'digital' as DealerListing['type'], listingKind: 'fixed' as ListingKind,
  images: [] as string[], quantity: 1, isNsfw: false, tags: '', status: 'active' as 'active' | 'draft',
  auctionEndsAt: '', bidIncrement: 5, autoBuyPrice: 0, raffleMaxTickets: 0,
  commissionSlotsTotal: 1 as number | '', commissionEtaDays: '' as number | '', commissionFieldsText: '',
  groupId: props.groups[0]?.id ?? '',
})

const kind = computed(() => form.value.listingKind)
const dirty = computed(() => form.value.title.trim() !== '' || form.value.description.trim() !== '')
const isBidKind = computed(() => kind.value === 'auction' || kind.value === 'ych')
const priceLabel = computed(() => isBidKind.value ? t.value.dealersDenStartPriceLabel : kind.value === 'raffle' ? t.value.dealersDenTicketPriceLabel : t.value.dealersDenPriceLabel)

const TYPES = computed(() => [
  { v: 'physical', l: t.value.dealersDenTypePhysical, icon: 'Package' },
  { v: 'digital',  l: t.value.dealersDenTypeDigital,  icon: 'Download' },
  { v: 'both',     l: t.value.dealersDenTypeBoth,     icon: 'Layers' },
] as const)
const kindLabel = (k: ListingKind) => KIND_META[k].labelKey ? (t.value as Record<string, string>)[KIND_META[k].labelKey!] : KIND_META[k].label

const showExit = ref(false)
const shaking = ref(false)
let shakeTimer: ReturnType<typeof setTimeout> | undefined
function shake() {
  clearTimeout(shakeTimer)
  shaking.value = false
  requestAnimationFrame(() => { shaking.value = true; shakeTimer = setTimeout(() => { shaking.value = false }, 600) })
}
watch(() => props.groups, g => { if (!form.value.groupId) form.value.groupId = g[0]?.id ?? '' })

// Крестик/«Отмена»: если форма заполнена — спрашиваем, закинуть ли в черновики
function tryClose() { dirty.value ? (showExit.value = true) : emit('close') }

const busy = ref(false)
const error = ref('')

async function submit(asDraft = false) {
  if (!form.value.title.trim() || !form.value.groupId) return
  showExit.value = false
  busy.value = true
  error.value = ''
  const f = form.value
  try {
    const created = await store.createListing({
      groupId: f.groupId,
      title: f.title, description: f.description || undefined,
      price: Number(f.price), currency: f.currency,
      discountPercent: supportsDiscount(f.listingKind) ? clampDiscount(f.discountPercent) : 0,
      category: f.category, type: f.type, listingKind: f.listingKind, images: f.images,
      quantity: f.listingKind === 'commission_queue' ? 1 : f.quantity, isNsfw: f.isNsfw,
      tags: f.tags.split(',').map(x => x.trim()).filter(Boolean),
      status: asDraft ? 'draft' : f.status,
      auctionEndsAt: f.auctionEndsAt || undefined,
      bidIncrement: f.bidIncrement || 1,
      autoBuyPrice: f.autoBuyPrice || undefined,
      raffleMaxTickets: f.raffleMaxTickets || undefined,
      commissionDetails: cleanDraft(details.value, f.listingKind === 'commission_queue'),
      ...(f.listingKind === 'commission_queue' ? {
        commissionSlotsTotal: Number(f.commissionSlotsTotal),
        commissionEtaDays: f.commissionEtaDays === '' ? undefined : Number(f.commissionEtaDays),
        commissionFormFields: parseFormFields(f.commissionFieldsText),
      } : {}),
    })
    emit('created', { id: created.id, title: created.title, image: created.images?.[0] ?? null, isDraft: created.status === 'draft' })
    emit('close')
  } catch (err) {
    error.value = apiErrorMessage(err) ?? t.value.dealersDenCreateFailed
  } finally { busy.value = false }
}
</script>

<template>
  <ModalShell :title="t.dealersDenNewListingTitle" subtitle="Dealers' Den · Bloomly" width="max-w-2xl"
    :shaking="shaking" :close-on-backdrop="false" @close="tryClose" @backdrop="shake">
    <div class="stack-y-5">
      <div v-if="groups.length">
        <label class="field-label">{{ t.dealersDenGroupLabel }}</label>
        <select v-model="form.groupId" class="w-full px-3 py-2.5 text-sm text-white outline-hidden">
          <option v-for="g in groups" :key="g.id" :value="g.id">{{ g.name }}</option>
        </select>
      </div>

      <div>
        <label class="field-label">{{ t.dealersDenSaleTypeLabel }}</label>
        <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
          <button v-for="k in KIND_ORDER" :key="k" type="button" @click="form.listingKind = k"
            class="rounded-2xl py-3.5 flex flex-col items-center gap-1.5 transition-all border"
            :class="kind === k ? [KIND_META[k].bg, 'border-white/20 shadow-md'] : 'border-white/8 bg-white/2 hover:border-white/15'">
            <BIcon :name="KIND_META[k].icon" class="w-5 h-5" :class="kind === k ? KIND_META[k].text : 'text-white/30'" />
            <span class="text-[10px] font-bold text-center leading-none" :class="kind === k ? 'text-white' : 'text-white/30'">{{ kindLabel(k) }}</span>
          </button>
        </div>
      </div>

      <div>
        <label class="field-label">{{ t.dealersDenPhotosLabel }}</label>
        <MediaUpload type="posts" :multiple="true" :max-files="20" @uploaded="(urls: string[]) => { form.images = urls }" />
      </div>

      <div>
        <label class="field-label">{{ t.dealersDenTitleLabel }} <span class="text-brand-accent normal-case font-normal">*</span></label>
        <input v-model="form.title" maxlength="200" :placeholder="t.dealersDenTitlePlaceholderCreate" class="w-full px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden" />
      </div>

      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="field-label !mb-0">{{ t.fursuitDescLabel }}</label>
          <span class="text-[11px] tabular-nums" :class="form.description.length > 440 ? 'text-brand-error/80' : 'text-white/35'">{{ form.description.length }}<span class="opacity-50">/500</span></span>
        </div>
        <textarea v-model="form.description" rows="3" maxlength="500" :placeholder="t.dealersDenDescPlaceholderCreate" class="w-full px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden resize-none" />
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="col-span-2">
          <label class="field-label">{{ priceLabel }} <span class="text-brand-accent normal-case font-normal">*</span></label>
          <div class="relative">
            <input v-model.number="form.price" type="number" min="0" step="0.01" placeholder="0.00" class="w-full px-4 py-3 pr-16 text-sm text-white outline-hidden" />
            <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/20 font-bold">{{ Number(form.price) === 0 ? t.subFree : form.currency }}</span>
          </div>
        </div>
        <div>
          <label class="field-label">{{ t.dealersDenCurrencyLabel }}</label>
          <select v-model="form.currency" class="w-full px-3 py-3 text-sm text-white outline-hidden appearance-none">
            <option v-for="c in LISTING_CURRENCIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>
      </div>

      <DenDiscountField v-if="supportsDiscount(kind)" v-model="form.discountPercent" :price="Number(form.price)" :currency="form.currency" />

      <div v-if="isBidKind" class="bg-brand-yellow/5 border border-brand-yellow/15 rounded-2xl p-4 stack-y-4">
        <p class="flex items-center gap-1.5 text-xs font-bold text-brand-yellow uppercase tracking-wider"><BIcon name="Hammer" class="w-3.5 h-3.5" /> {{ t.dealersDenAuctionParamsTitle }}</p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label">{{ t.dealersDenAuctionEndLabel }}</label>
            <input v-model="form.auctionEndsAt" type="datetime-local" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
          </div>
          <div>
            <label class="field-label">{{ t.dealersDenBidStepLabel }}</label>
            <input v-model.number="form.bidIncrement" type="number" min="0.01" step="0.01" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
          </div>
        </div>
        <div>
          <label class="field-label">{{ t.dealersDenAutoBuyOptionalLabel }}</label>
          <input v-model.number="form.autoBuyPrice" type="number" min="0" step="0.01" :placeholder="t.dealersDenAutoBuyPlaceholder" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
        </div>
      </div>

      <div v-if="kind === 'commission_queue'" class="bg-brand-pink/5 border border-brand-pink/15 rounded-2xl p-4 stack-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label">{{ t.dealersDenCommissionSlotsLabel }} <span class="text-brand-accent normal-case font-normal">*</span></label>
            <input v-model.number="form.commissionSlotsTotal" type="number" min="1" max="1000" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
          </div>
          <div>
            <label class="field-label">{{ t.dealersDenCommissionEtaLabel }}</label>
            <input v-model.number="form.commissionEtaDays" type="number" min="0" max="365" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
          </div>
        </div>
        <div>
          <label class="field-label">{{ t.dealersDenCommissionFieldsLabel }} <span class="normal-case font-normal text-white/20">{{ t.dealersDenCommissionFieldsHint }}</span></label>
          <textarea v-model="form.commissionFieldsText" rows="3" placeholder="Reference link*&#10;Colour palette" class="w-full px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden resize-none" />
        </div>
      </div>

      <ListingDetailsEditor :draft="details" :commission="kind === 'commission_queue'" />

      <div v-if="kind === 'raffle'" class="bg-brand-success/5 border border-brand-success/15 rounded-2xl p-4 stack-y-3">
        <p class="flex items-center gap-1.5 text-xs font-bold text-brand-success uppercase tracking-wider"><BIcon name="Gift" class="w-3.5 h-3.5" /> {{ t.dealersDenRaffleParamsTitle }}</p>
        <div>
          <label class="field-label">{{ t.dealersDenMaxTicketsLabel }}</label>
          <input v-model.number="form.raffleMaxTickets" type="number" min="0" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
        </div>
      </div>

      <!-- Рамки аватара сюда не попадают: у них своя форма загрузки с модерацией -->
      <div>
        <label class="field-label">{{ t.category }}</label>
        <div class="flex flex-wrap gap-2">
          <button v-for="cat in categories.slice(1)" :key="cat.key" type="button" @click="form.category = cat.key as DealerListing['category']"
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border"
            :class="form.category === cat.key ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' : 'border-white/8 text-white/35 hover:text-white hover:border-white/20'">
            <BIcon :name="cat.icon" class="w-3 h-3" /> {{ cat.label }}
          </button>
        </div>
      </div>

      <div>
        <label class="field-label">{{ t.dealersDenProductTypeLabel }}</label>
        <div class="grid grid-cols-3 gap-2">
          <button v-for="ty in TYPES" :key="ty.v" type="button" @click="form.type = ty.v"
            class="rounded-2xl py-3 flex flex-col items-center gap-1.5 transition-all border"
            :class="form.type === ty.v ? 'border-brand-accent bg-brand-accent/15' : 'border-white/8 bg-white/2 hover:border-white/15'">
            <BIcon :name="ty.icon" class="w-5 h-5" :class="form.type === ty.v ? 'text-white' : 'text-white/30'" />
            <span class="text-xs font-bold" :class="form.type === ty.v ? 'text-white' : 'text-white/30'">{{ ty.l }}</span>
          </button>
        </div>
      </div>

      <div class="grid gap-3" :class="kind === 'commission_queue' ? 'grid-cols-1' : 'grid-cols-2'">
        <div v-if="kind !== 'commission_queue'">
          <label class="field-label">{{ t.dealersDenQuantityLabel }}</label>
          <input v-model.number="form.quantity" type="number" min="1" class="w-full px-4 py-3 text-sm text-white outline-hidden" />
        </div>
        <div>
          <label class="field-label">{{ t.statusFieldLabel }}</label>
          <div class="flex gap-2 h-[46px]">
            <button v-for="s in ([{ v: 'active', l: t.dealersDenStatusActiveLabel, icon: 'CircleCheck' }, { v: 'draft', l: t.dealersDenDraftBadge, icon: 'Pencil' }] as const)"
              :key="s.v" type="button" @click="form.status = s.v"
              class="flex-1 flex items-center justify-center gap-1.5 rounded-2xl text-xs font-bold transition-all border"
              :class="form.status === s.v ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' : 'border-white/8 text-white/30 hover:text-white hover:border-white/20'">
              <BIcon :name="s.icon" class="w-3.5 h-3.5" /> {{ s.l }}
            </button>
          </div>
        </div>
      </div>

      <div>
        <label class="field-label">{{ t.dealersDenTagsLabel }} <span class="normal-case font-normal text-white/20">{{ t.dealersDenTagsHint }}</span></label>
        <input v-model="form.tags" :placeholder="t.dealersDenTagsPlaceholder" class="w-full px-4 py-3 text-sm text-white placeholder-white/20 outline-hidden" />
      </div>

      <div class="flex items-center justify-between p-4 rounded-2xl bg-brand-error/5 border border-brand-error/15">
        <div>
          <p class="text-sm font-bold text-white">{{ t.dealersDenNsfwContentLabel }}</p>
          <p class="text-xs text-white/30 mt-0.5">{{ t.dealersDenNsfwBlurHint }}</p>
        </div>
        <ToggleSwitch v-model="form.isNsfw" />
      </div>

      <div v-if="error" class="text-brand-error text-xs font-medium bg-brand-error/10 border border-brand-error/20 rounded-xl px-4 py-3">{{ error }}</div>
      <div class="flex gap-3 pt-1">
        <button type="button" @click="tryClose" class="px-5 py-3 border border-white/8 text-white/40 text-sm font-bold rounded-2xl transition-all hover:bg-white/5 hover:text-white">{{ t.cancel }}</button>
        <button type="button" @click="submit()" :disabled="busy || !form.title.trim() || String(form.price) === ''"
          class="flex-1 flex items-center justify-center gap-2 py-3 disabled:opacity-35 disabled:cursor-not-allowed text-white text-sm font-bold rounded-2xl transition-all shadow-lg hover:opacity-90 bg-brand-gradient">
          <span v-if="busy" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <BIcon v-else name="Rocket" class="w-4 h-4" />
          {{ busy ? t.creatingBtn : t.dealersDenPublishBtn }}
        </button>
      </div>
    </div>
  </ModalShell>

  <DenExitConfirmModal v-if="showExit" :can-save-draft="!!form.title.trim() && !!form.groupId" :busy="busy"
    @draft="submit(true)" @discard="emit('close')" @stay="showExit = false" />
</template>
