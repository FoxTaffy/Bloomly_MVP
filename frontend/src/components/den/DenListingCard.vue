<script setup lang="ts">
import { computed } from 'vue'
import type { DealerListing } from '@/stores/dealersDen'
import { useLangStore } from '@/stores/lang'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { kindMeta } from '@/lib/denKinds'
import * as fmt from '@/lib/format'
import BIcon from '@/components/BIcon.vue'
import DenCountdown from '@/components/DenCountdown.vue'
import DenDiscountPrice from '@/components/DenDiscountPrice.vue'
import DenSellerRow from '@/components/den/DenSellerRow.vue'

// Карточка лота каталога: превью, чипы и панель, зависящая от вида продажи.
const props = defineProps<{
  listing: DealerListing
  /** где показана карточка: у своих лотов и черновиков — кнопки управления */
  mode: 'browse' | 'my' | 'drafts' | 'wishlist'
  viewerId?: string
  /** аукцион уже закончился по часам клиента */
  ended?: boolean
  canAutoBump?: boolean
  bumpHint?: string
  bumping?: boolean
  buyingTicket?: boolean
}>()

const emit = defineEmits<{
  open: []
  nsfw: []
  wishlist: []
  bid: []
  ticket: []
  tag: [tag: string]
  edit: []
  remove: []
  bump: []
  autobump: []
}>()

const langStore = useLangStore()
const t = computed(() => langStore.t)
const { nsfwEnabled } = useNsfwMode()

const l = computed(() => props.listing)
const meta = computed(() => kindMeta(l.value.listing_kind))
const kind = computed(() => l.value.listing_kind ?? 'fixed')
const isBidKind = computed(() => kind.value === 'auction' || kind.value === 'ych')
const soldOut = computed(() => l.value.status === 'sold' || (l.value.quantity > 0 && l.value.quantity_sold >= l.value.quantity))
const nsfwBlur = computed(() => l.value.is_nsfw && !nsfwEnabled.value && !soldOut.value)
const isOwn = computed(() => props.viewerId === l.value.seller_id)
const managing = computed(() => props.mode === 'my' || props.mode === 'drafts')
const queued = computed(() => l.value.status === 'active' && !l.value.feed_published_at)
const price = (v: string | number | null | undefined) => fmt.formatPrice(v as never, l.value.currency)

const ticketPct = computed(() => {
  const max = l.value.raffle_max_tickets
  return max ? Math.min(100, Math.round(((l.value.raffle_tickets_sold ?? 0) / max) * 100)) : 0
})
const slotsLeft = computed(() => Math.max((l.value.quantity ?? 1) - (l.value.quantity_sold ?? 0), 0))
const iconBtn = 'w-7 h-7 bg-black/60 backdrop-blur-xs rounded-full flex items-center justify-center transition-all'
</script>

<template>
  <div class="card-surface group cursor-pointer hover:border-brand-accent/50 hover:-translate-y-0.5 transition-all hover:shadow-brand-accent/10"
    @click="emit('open')">

    <!-- Превью -->
    <div class="relative w-full overflow-hidden bg-brand-bg aspect-4/3">
      <img v-if="l.images[0]" :src="l.images[0]" :alt="l.title" loading="lazy"
        class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
      <div v-else class="w-full h-full flex items-center justify-center bg-linear-to-br from-brand-bg to-brand-border">
        <BIcon name="Image" class="w-12 h-12 text-white/10" />
      </div>
      <div class="absolute inset-0 bg-linear-to-t/srgb from-black/50 to-transparent" />

      <div v-if="soldOut" class="absolute inset-0 bg-black/65 flex items-center justify-center">
        <span class="bg-brand-error text-white text-xs font-extrabold px-4 py-1.5 rounded-full tracking-wide">{{ t.dealersDenSoldBadge }}</span>
      </div>
      <div v-else-if="nsfwBlur"
        class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 cursor-pointer backdrop-blur-lg bg-black/45"
        @click.stop="emit('nsfw')">
        <span class="text-3xl select-none">🔞</span>
        <span class="text-[10px] font-extrabold text-white bg-brand-error/90 px-3 py-1 rounded-full tracking-wide">{{ t.dealersDenNsfwTapToView }}</span>
      </div>

      <span class="chip absolute top-2 left-2" :class="[meta.text, meta.border, meta.bg]">
        <BIcon :name="meta.icon" class="w-2.5 h-2.5" />
        {{ meta.labelKey ? (t as Record<string, string>)[meta.labelKey] : meta.label }}
      </span>
      <span v-if="mode === 'my' && queued" class="chip absolute top-2 left-2 z-10 border-transparent bg-black/70 text-brand-yellow" :title="t.dealersDenFeedQueuedHint">
        {{ t.dealersDenFeedQueued }}
      </span>

      <button v-if="!isOwn" @click.stop="emit('wishlist')"
        :title="l.is_wishlisted ? t.dealersDenWishlistRemove : t.dealersDenWishlistAdd"
        class="absolute top-2 right-2 z-20 h-7 min-w-7 px-1.5 rounded-full backdrop-blur-xs flex items-center justify-center gap-1 text-[10px] font-extrabold transition-all active:scale-90"
        :class="l.is_wishlisted ? 'bg-brand-error/90 text-white' : 'bg-black/55 text-white/80 hover:bg-brand-error/80'">
        <BIcon name="Heart" class="w-3.5 h-3.5" :class="l.is_wishlisted ? 'fill-current' : ''" />
        <span v-if="(l.wishlist_count ?? 0) > 0" class="tabular-nums">{{ l.wishlist_count }}</span>
      </button>
      <span v-if="l.type !== 'physical'" class="chip absolute top-2 border-transparent"
        :class="[isOwn ? 'right-2' : 'right-11', l.type === 'digital' ? 'bg-brand-accent/90 text-white' : 'bg-brand-yellow/90 text-black']">
        {{ l.type === 'digital' ? t.dealersDenTypeDigital : t.dealersDenTypeBoth }}
      </span>

      <span v-if="l.status === 'draft'" class="chip absolute bottom-2 left-2 border-transparent bg-white/15 text-white/80">
        <BIcon name="Pencil" class="w-2.5 h-2.5" /> {{ t.dealersDenDraftBadge }}
      </span>

      <DenCountdown v-if="isBidKind && !soldOut && !managing" v-slot="{ text, hot }" :ends-at="l.auction_ends_at">
        <span class="chip absolute bottom-2 right-2 border-transparent tabular-nums"
          :class="hot ? 'bg-brand-error/90 text-white' : 'bg-black/60 text-white/80'">{{ text || '—' }}</span>
      </DenCountdown>

      <div v-if="managing" class="absolute bottom-2 right-2 flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" @click.stop>
        <button v-if="mode === 'my' && l.status === 'active'" @click="emit('autobump')"
          :title="canAutoBump ? t.dealersDenAutoBump : t.dealersDenAutoBumpPlan"
          :class="[iconBtn, l.auto_bump ? 'bg-brand-accent' : 'hover:bg-brand-accent', canAutoBump ? '' : 'opacity-50']">
          <BIcon name="RefreshCw" class="w-3.5 h-3.5 text-white" />
        </button>
        <button v-if="mode === 'my' && l.status === 'active'" @click="emit('bump')" :disabled="bumping" :title="bumpHint"
          :class="[iconBtn, 'hover:bg-brand-accent disabled:opacity-50']">
          <BIcon name="ArrowUp" class="w-3.5 h-3.5 text-white" />
        </button>
        <button @click="emit('edit')" :class="[iconBtn, 'hover:bg-brand-accent']"><BIcon name="Pencil" class="w-3.5 h-3.5 text-white" /></button>
        <button @click="emit('remove')" :class="[iconBtn, 'hover:bg-brand-error']"><BIcon name="Trash2" class="w-3.5 h-3.5 text-white" /></button>
      </div>
    </div>

    <!-- Название и витрина -->
    <div class="px-3 pt-2.5" :class="kind === 'fixed' ? 'pb-3' : 'pb-1.5'">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <h3 class="font-extrabold text-white text-xs leading-tight line-clamp-1">{{ l.title }}</h3>
          <DenSellerRow :listing="l" :text-class="meta.text" />
        </div>
        <!-- Фиксированная цена живёт справа от названия -->
        <div v-if="kind === 'fixed'" class="shrink-0 flex flex-col items-end gap-0.5">
          <template v-if="soldOut">
            <span class="text-[10px] font-bold text-white/30 line-through">{{ price(l.price) }}</span>
            <span class="text-[9px] font-bold text-brand-error/60">{{ t.dealersDenOutOfStock }}</span>
          </template>
          <template v-else>
            <DenDiscountPrice :listing="l" align="end" />
            <span v-if="l.quantity > 1" class="text-[9px] text-brand-success/80 font-medium tabular-nums">
              <BIcon name="Package" class="w-2.5 h-2.5 inline" /> {{ slotsLeft }} {{ t.dealersDenPiecesAbbr }}
            </span>
            <span v-else-if="parseFloat(String(l.price)) === 0" class="text-[9px] font-bold text-brand-success">{{ t.subFree }}</span>
          </template>
        </div>
      </div>
    </div>

    <!-- Панель вида продажи -->
    <div v-if="kind !== 'fixed'" class="mx-2 mb-2 rounded-xl border px-2.5 py-2" :class="meta.panel" @click.stop>

      <!-- Аукцион -->
      <div v-if="kind === 'auction'" class="flex items-center justify-between">
        <div>
          <p class="text-[8px] text-white/35 uppercase tracking-wider leading-none mb-0.5">{{ t.dealersDenCurrentBid }}</p>
          <p class="text-sm font-black tabular-nums leading-none" :class="meta.text">{{ price(l.current_bid ?? l.price) }}</p>
          <p class="text-[8px] text-white/30 mt-0.5">{{ l.bid_count ?? 0 }} {{ t.dealersDenBidsCountSuffix }}</p>
        </div>
        <div class="flex flex-col items-end gap-1.5">
          <DenCountdown v-slot="{ text, hot }" :ends-at="l.auction_ends_at">
            <span class="text-[9px] font-extrabold tabular-nums leading-none" :class="hot ? 'text-brand-error' : 'text-white/50'">{{ text || '—' }}</span>
          </DenCountdown>
          <button v-if="!soldOut && !ended && !isOwn" @click="emit('bid')"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-extrabold text-white transition-all hover:opacity-90 active:scale-95" :class="meta.btn">
            <BIcon name="Hammer" class="w-3 h-3" /> {{ t.dealersDenBidWord }}
          </button>
          <span v-else-if="soldOut || ended" class="text-[9px] font-bold text-brand-error/70">{{ t.dealersDenAuctionEnded }}</span>
        </div>
      </div>

      <!-- YCH -->
      <template v-else-if="kind === 'ych'">
        <div class="flex items-center gap-1 mb-1.5">
          <span v-for="s in Math.max(l.quantity ?? 1, 1)" :key="s" class="w-3.5 h-3.5 rounded-xs shrink-0 transition-all"
            :class="s <= (l.quantity_sold ?? 0) ? 'bg-brand-purple/20 border border-brand-purple/15' : 'bg-brand-purple shadow-[0_0_4px] shadow-brand-purple/40'" />
          <span class="text-[9px] text-white/35 ml-1 font-medium tabular-nums">{{ slotsLeft }} / {{ l.quantity ?? 1 }}</span>
        </div>
        <div class="flex items-center justify-between gap-1">
          <div>
            <p class="text-[8px] text-white/35 uppercase tracking-wider leading-none mb-0.5">{{ t.dealersDenBidWord }}</p>
            <p class="text-xs font-black tabular-nums leading-none" :class="meta.text">{{ price(l.current_bid ?? l.price) }}</p>
            <p v-if="l.auto_buy_price" class="text-[8px] text-brand-yellow/70 mt-0.5 font-bold">{{ t.dealersDenBuyNowShort }}: {{ price(l.auto_buy_price) }}</p>
          </div>
          <button v-if="!soldOut && !ended && !isOwn" @click="emit('bid')"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-extrabold text-white transition-all hover:opacity-90 active:scale-95" :class="meta.btn">
            <BIcon name="Paintbrush" class="w-3 h-3" /> {{ t.dealersDenSlotBtn }}
          </button>
          <span v-else-if="soldOut || ended" class="text-[9px] font-bold text-brand-error/70">{{ ended ? t.dealersDenAuctionEnded : t.dealersDenAllTaken }}</span>
        </div>
      </template>

      <!-- Розыгрыш -->
      <template v-else-if="kind === 'raffle'">
        <div class="flex items-center justify-between mb-1">
          <span class="text-[8px] text-white/35 uppercase tracking-wider">
            {{ l.raffle_tickets_sold ?? 0 }}{{ l.raffle_max_tickets ? ` / ${l.raffle_max_tickets}` : '' }} {{ t.dealersDenTicketsSuffix }}
          </span>
          <span v-if="l.raffle_max_tickets" class="text-[8px] font-bold" :class="meta.text">{{ ticketPct }}%</span>
        </div>
        <div class="w-full h-1.5 bg-black/30 rounded-full overflow-hidden mb-2">
          <div class="h-full rounded-full transition-all duration-700 bg-linear-to-r from-brand-success to-emerald-600"
            :style="{ width: (l.raffle_max_tickets ? ticketPct : Math.min(100, (l.raffle_tickets_sold ?? 0) * 5)) + '%' }" />
        </div>
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1"><DenDiscountPrice :listing="l" size="xs" :price-class="meta.text" /><span class="text-[8px] text-white/30 font-normal">/{{ t.dealersDenPiecesAbbr }}</span></div>
          <button v-if="!soldOut && !isOwn" @click="emit('ticket')" :disabled="buyingTicket"
            class="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-extrabold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50" :class="meta.btn">
            <BIcon name="Ticket" class="w-3 h-3" /> {{ t.dealersDenTicketBtn }}
          </button>
          <span v-else-if="soldOut" class="text-[9px] font-bold text-brand-success/60">{{ t.dealersDenRaffleDrawn }}</span>
        </div>
      </template>

      <!-- Очередь комиссий -->
      <div v-else class="flex items-center justify-between gap-2">
        <div>
          <p class="text-[8px] text-white/35 uppercase tracking-wider leading-none mb-0.5">{{ t.dealersDenCommissionSlotsLabel }}</p>
          <p class="text-sm font-black tabular-nums leading-none" :class="meta.text">
            {{ l.commission_slots_total == null ? '∞' : Math.max(0, l.commission_slots_total - l.commission_slots_taken) }}
            <span class="text-[8px] font-bold text-white/35">{{ t.dealersDenCommissionSlotsFree }}</span>
          </p>
        </div>
        <div class="text-right">
          <DenDiscountPrice :listing="l" size="xs" :price-class="meta.text" align="end" />
          <p v-if="l.commission_eta_days != null" class="text-[8px] text-white/30 mt-0.5">{{ t.dealersDenCommissionEtaLabel }}: {{ l.commission_eta_days }}</p>
        </div>
      </div>
    </div>

    <!-- Хэштеги -->
    <div v-if="l.tags?.length" class="px-3 pb-2.5 flex flex-wrap gap-1" @click.stop>
      <button v-for="tag in l.tags.slice(0, 4)" :key="tag" @click="emit('tag', tag)"
        class="text-[9px] font-bold text-brand-accent/80 bg-brand-accent/8 hover:bg-brand-accent/15 px-2 py-0.5 rounded-full transition-colors">
        #{{ tag }}
      </button>
    </div>
  </div>
</template>
