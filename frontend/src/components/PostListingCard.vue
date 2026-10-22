<script setup lang="ts">
import { computed } from 'vue'
import BIcon from '@/components/BIcon.vue'
import DenDiscountPrice from '@/components/DenDiscountPrice.vue'
import { useNsfwMode } from '@/composables/useNsfwMode'
import type { PostListingPreview } from '@/lib/postListing'

// Плоская карточка лота Dealers' Den внизу поста «Обновление заказа»: превью, название, цена.
// Клик ведёт на страницу лота, где оформляется заказ (покупка, ставка, заявка на комиссию).
// Без `interactive` (форма поста, режим правки) карточка не ссылка, а просто превью.
const props = withDefaults(defineProps<{
  listing: PostListingPreview
  interactive?: boolean
}>(), { interactive: true })

const { nsfwMode } = useNsfwMode()

const ACTION_BY_KIND: Record<string, string> = {
  fixed: 'Купить',
  commission_queue: 'Заказать',
  auction: 'Сделать ставку',
  ych: 'Сделать ставку',
  raffle: 'Участвовать',
}
const KIND_LABEL: Record<string, string> = {
  fixed: 'Товар',
  commission_queue: 'Комиссии',
  auction: 'Аукцион',
  ych: 'YCH',
  raffle: 'Розыгрыш',
}

const cover = computed(() => props.listing.images?.[0] || '')
const isSold = computed(() => props.listing.status === 'sold')
const blurred = computed(() => !!props.listing.is_nsfw && nsfwMode.value !== 'show')
const action = computed(() => ACTION_BY_KIND[props.listing.listing_kind] ?? 'Открыть')
const kindLabel = computed(() => KIND_LABEL[props.listing.listing_kind] ?? 'Лот')
// У аукциона показываем текущую ставку, если она есть
const priceView = computed(() => {
  const l = props.listing
  const isAuction = l.listing_kind === 'auction' || l.listing_kind === 'ych'
  return { ...l, price: isAuction && l.current_bid ? l.current_bid : l.price }
})
</script>

<template>
  <component
    :is="interactive ? 'router-link' : 'div'"
    :to="interactive ? { name: 'dealer-listing', params: { id: listing.id } } : undefined"
    class="flex items-center gap-3 rounded-xl border border-brand-border bg-brand-bg p-2 transition-colors"
    :class="interactive ? 'hover:border-brand-accent/50 hover:bg-brand-card cursor-pointer' : ''"
    :data-testid="interactive ? 'post-listing-card' : 'post-listing-preview'"
    @click="interactive && $event.stopPropagation()"
  >
    <div class="relative w-14 h-14 shrink-0 rounded-lg overflow-hidden bg-brand-card border border-brand-border">
      <img v-if="cover" :src="cover" :alt="listing.title" loading="lazy"
        class="w-full h-full object-cover" :class="blurred ? 'blur-md scale-110' : ''" />
      <div v-else class="w-full h-full flex items-center justify-center">
        <BIcon name="ShoppingBag" class="w-6 h-6 text-white/20" />
      </div>
      <span v-if="blurred" class="absolute inset-0 flex items-center justify-center text-lg select-none">🔞</span>
    </div>

    <div class="min-w-0 flex-1">
      <p class="text-[10px] font-bold uppercase tracking-wide text-white/35 leading-none mb-1">
        Dealers' Den · {{ kindLabel }}
      </p>
      <p class="text-sm font-bold text-white truncate">{{ listing.title }}</p>
      <div class="mt-0.5">
        <span v-if="isSold" class="text-xs font-bold text-brand-error">Продано</span>
        <DenDiscountPrice v-else :listing="priceView" size="xs" />
      </div>
    </div>

    <span v-if="interactive && !isSold"
      class="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-accent/15 text-brand-accent text-xs font-bold border border-brand-accent/30 max-sm:hidden">
      {{ action }}
      <BIcon name="ChevronRight" class="w-3.5 h-3.5" />
    </span>
    <BIcon v-else-if="interactive" name="ChevronRight" class="w-4 h-4 shrink-0 text-white/30" />
    <slot name="actions" />
  </component>
</template>
