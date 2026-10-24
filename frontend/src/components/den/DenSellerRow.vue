<script setup lang="ts">
import type { DealerListing } from '@/stores/dealersDen'
import { listingShop } from '@/lib/dealerShop'
import UserBadges from '@/components/UserBadges.vue'

// Строка «аватар + название витрины + значки» под названием лота (общая для всех видов продажи).
const props = defineProps<{ listing: Pick<DealerListing, 'group' | 'seller'>; textClass?: string }>()
const shop = listingShop(props.listing)
</script>

<template>
  <div class="flex items-center gap-1 mt-0.5 min-w-0">
    <img v-if="shop.avatar" :src="shop.avatar" class="w-4 h-4 rounded-full object-cover shrink-0 border border-white/10" />
    <div v-else class="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center shrink-0 text-[7px] text-white/70 font-extrabold">
      {{ shop.name[0]?.toUpperCase() }}
    </div>
    <span class="text-[10px] truncate font-medium" :class="textClass ?? 'text-white/60'">{{ shop.name }}</span>
    <UserBadges v-if="!shop.isGroup" :user="listing.seller" />
  </div>
</template>
