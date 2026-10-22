<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLangStore } from '@/stores/lang'
import { useNsfwMode } from '@/composables/useNsfwMode'
import { listingShop } from '@/lib/dealerShop'
import api from '@/api'
import BIcon from './BIcon.vue'
import DenDiscountPrice from './DenDiscountPrice.vue'

const props = defineProps<{ listing: any }>()
const emit  = defineEmits<{ unbookmarked: [id: string] }>()

const router    = useRouter()
const langStore = useLangStore()
const { nsfwEnabled } = useNsfwMode()
const removing  = ref(false)

const shop = listingShop(props.listing)
const isSold = () => props.listing.status === 'sold'

async function removeBookmark() {
  removing.value = true
  try {
    await api.post(`/bookmarks/listings/${props.listing.id}`)
    emit('unbookmarked', props.listing.id)
  } catch {}
  finally { removing.value = false }
}
</script>

<template>
  <div
    class="bg-brand-card border border-brand-border rounded-2xl overflow-hidden hover:border-brand-accent/40 transition-all group flex flex-col cursor-pointer"
    @click="router.push({ name: 'dealer-listing', params: { id: listing.id } })">

    <!-- Image -->
    <div class="relative aspect-4/3 shrink-0 bg-[#090d20]">
      <img v-if="listing.images?.[0]" :src="listing.images[0]" :alt="listing.title"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        :class="listing.is_nsfw && !nsfwEnabled ? 'blur-xl' : ''" />
      <div v-else class="w-full h-full flex items-center justify-center">
        <BIcon name="Image" class="w-10 h-10 text-brand-border" />
      </div>

      <span v-if="listing.is_nsfw"
        class="absolute top-2 left-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-brand-error/80 text-white border border-brand-error/30 backdrop-blur-xs">
        18+
      </span>
      <span v-if="isSold()"
        class="absolute bottom-2 left-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-md bg-black/70 text-white/80 backdrop-blur-xs">
        {{ langStore.t.dealerListingSoldOutBadge }}
      </span>

      <button
        @click.stop="removeBookmark"
        :disabled="removing"
        class="absolute top-2 right-2 p-1.5 rounded-xl bg-black/50 backdrop-blur-xs text-white/70 hover:text-yellow-400 hover:bg-black/70 transition-all opacity-0 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-30"
        :title="langStore.t.unbookmarkListing">
        <BIcon name="BookmarkX" class="w-3.5 h-3.5" />
      </button>
    </div>

    <!-- Body -->
    <div class="p-3 flex flex-col gap-1.5 flex-1">
      <p class="font-bold text-sm text-white line-clamp-2 leading-tight">{{ listing.title }}</p>
      <p class="text-[11px] text-white/40 truncate">{{ shop.name }}</p>
      <div class="mt-auto pt-1">
        <DenDiscountPrice :listing="listing" size="sm" />
      </div>
    </div>
  </div>
</template>
