<script setup lang="ts">
import { computed } from 'vue'
import * as fmt from '@/lib/format'
import { listingDiscount, discountedPrice } from '@/lib/listingDiscount'

// Цена лота с учётом скидки: новая цена, зачёркнутая старая и плашка «−N%».
// Без скидки показывает обычную цену, так что можно подставлять везде вместо formatPrice.
const props = withDefaults(defineProps<{
  listing: { price: string | number; currency: string; listing_kind: string; discount_percent?: number | null }
  size?: 'xs' | 'sm' | 'lg'
  priceClass?: string
  align?: 'start' | 'end'
}>(), { size: 'sm', priceClass: 'text-brand-yellow', align: 'start' })

const percent = computed(() => listingDiscount(props.listing))
const current = computed(() => percent.value
  ? fmt.formatPrice(discountedPrice(props.listing.price, percent.value), props.listing.currency)
  : fmt.formatPrice(props.listing.price, props.listing.currency))
const old = computed(() => fmt.formatPrice(props.listing.price, props.listing.currency))

const priceSize = { xs: 'text-xs', sm: 'text-sm', lg: 'text-4xl' }
const oldSize = { xs: 'text-[9px]', sm: 'text-[10px]', lg: 'text-base' }
const badgeSize = { xs: 'text-[8px] px-1 py-px', sm: 'text-[9px] px-1.5 py-0.5', lg: 'text-sm px-2.5 py-1' }
</script>

<template>
  <div class="flex flex-col gap-0.5" :class="align === 'end' ? 'items-end' : 'items-start'">
    <div class="flex items-center gap-1.5 flex-wrap" :class="align === 'end' ? 'justify-end' : ''">
      <span class="font-black tabular-nums leading-none" :class="[priceSize[size], priceClass]">{{ current }}</span>
      <span v-if="percent"
        class="font-extrabold rounded-md leading-none text-white shadow-xs"
        :class="badgeSize[size]"
        style="background: linear-gradient(135deg, #f43f5e, #fb7185)">−{{ percent }}%</span>
    </div>
    <span v-if="percent" class="font-bold text-white/35 line-through tabular-nums leading-none" :class="oldSize[size]">{{ old }}</span>
  </div>
</template>
